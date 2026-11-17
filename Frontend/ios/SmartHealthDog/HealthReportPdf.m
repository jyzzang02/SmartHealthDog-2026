#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>
#import <math.h>

static NSDictionary *ReportDictionary(id value)
{
  return [value isKindOfClass:NSDictionary.class] ? value : nil;
}

static NSArray *ReportArray(id value)
{
  return [value isKindOfClass:NSArray.class] ? value : @[];
}

static NSString *ReportText(id value)
{
  if (![value isKindOfClass:NSString.class]) return nil;
  NSString *text = value;
  if (text.length <= 4096) return text;
  NSUInteger end = [text rangeOfComposedCharacterSequenceAtIndex:4096].location;
  return [text substringToIndex:end];
}

static BOOL ReportFlag(id value)
{
  return [value isKindOfClass:NSNumber.class] && [value boolValue];
}

static UIColor *ReportColor(NSUInteger rgb)
{
  return [UIColor colorWithRed:((rgb >> 16) & 255) / 255.0
                       green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
}

static NSDictionary *ReportStyle(CGFloat size, UIColor *color, BOOL bold, NSTextAlignment alignment)
{
  NSMutableParagraphStyle *style = [[NSMutableParagraphStyle alloc] init];
  style.alignment = alignment;
  style.lineBreakMode = NSLineBreakByWordWrapping;
  return @{NSFontAttributeName: bold ? [UIFont boldSystemFontOfSize:size] : [UIFont systemFontOfSize:size],
    NSForegroundColorAttributeName: color, NSParagraphStyleAttributeName: style};
}

static CGFloat ReportHeight(NSString *text, NSDictionary *attrs, CGFloat width)
{
  return ceil([text boundingRectWithSize:CGSizeMake(width, CGFLOAT_MAX)
    options:NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading
    attributes:attrs context:nil].size.height);
}

static void ReportDraw(NSString *text, NSDictionary *attrs, CGRect rect)
{
  [text drawWithRect:rect options:NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading
    attributes:attrs context:nil];
}

// Split only blocks that cannot fit on an empty page or in a single chip.
static NSArray<NSString *> *ReportTextParts(NSString *text, NSDictionary *attrs, CGFloat width, CGFloat maxHeight)
{
  if (!text.length) return @[@""];
  NSMutableArray<NSString *> *parts = [NSMutableArray array];
  while (ReportHeight(text, attrs, width) > maxHeight) {
    NSUInteger low = 1, high = text.length;
    while (low < high) {
      NSUInteger middle = low + (high - low + 1) / 2;
      if (ReportHeight([text substringToIndex:middle], attrs, width) <= maxHeight) low = middle;
      else high = middle - 1;
    }
    NSUInteger end = low;
    if (end < text.length) end = [text rangeOfComposedCharacterSequenceAtIndex:end].location;
    if (!end) end = NSMaxRange([text rangeOfComposedCharacterSequenceAtIndex:0]);
    [parts addObject:[text substringToIndex:end]];
    text = [text substringFromIndex:end];
  }
  if (text.length) [parts addObject:text];
  return parts;
}

static void ReportLine(CGFloat left, CGFloat right, CGFloat y, UIColor *color)
{
  UIBezierPath *path = [UIBezierPath bezierPath];
  [path moveToPoint:CGPointMake(left, y)];
  [path addLineToPoint:CGPointMake(right, y)];
  path.lineWidth = 0.8;
  [color setStroke];
  [path stroke];
}

static void ReportRound(CGRect rect, UIColor *color, BOOL outline)
{
  UIBezierPath *path = [UIBezierPath bezierPathWithRoundedRect:rect cornerRadius:7];
  if (outline) {
    [color setStroke];
    path.lineWidth = 1;
    [path stroke];
  } else {
    [color setFill];
    [path fill];
  }
}

@interface HealthReportPdf : NSObject <RCTBridgeModule, UIDocumentPickerDelegate>
@property (nonatomic, copy) RCTPromiseResolveBlock finish;
@property (nonatomic, strong) NSURL *exportDirectory;
@end

@implementation HealthReportPdf

RCT_EXPORT_MODULE(HealthReportPdf)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (void)clearExport
{
  if (self.exportDirectory) {
    [[NSFileManager defaultManager] removeItemAtURL:self.exportDirectory error:nil];
    self.exportDirectory = nil;
  }
  self.finish = nil;
}

- (void)dealloc
{
  if (_exportDirectory) [[NSFileManager defaultManager] removeItemAtURL:_exportDirectory error:nil];
}

RCT_EXPORT_METHOD(save:(NSString *)fileName
                  paragraphs:(NSArray<NSDictionary *> *)rows
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (fileName.length > 100 || ![fileName hasSuffix:@".pdf"] ||
      ![fileName isEqualToString:fileName.lastPathComponent] ||
      [fileName rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location != NSNotFound ||
      rows.count == 0 || rows.count > 5000) {
    reject(@"PDF_INVALID", @"Invalid PDF content", nil);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.finish || !RCTPresentedViewController()) {
      reject(@"PDF_UNAVAILABLE", @"PDF save is unavailable", nil);
      return;
    }
    self.finish = resolve;
    self.exportDirectory = [[NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES]
      URLByAppendingPathComponent:NSUUID.UUID.UUIDString isDirectory:YES];
    NSURL *directory = self.exportDirectory;
    NSURL *file = [directory URLByAppendingPathComponent:fileName isDirectory:NO];

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      NSError *error;
      BOOL wrote = [[NSFileManager defaultManager] createDirectoryAtURL:directory
        withIntermediateDirectories:YES attributes:nil error:&error] && [self writePdf:rows toURL:file];
      dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *presenter = RCTPresentedViewController();
        if (!wrote || !presenter || !presenter.view.window) {
          [self clearExport];
          reject(@"PDF_SAVE_FAILED", @"Could not save PDF", nil);
          return;
        }
        UIDocumentPickerViewController *picker = [[UIDocumentPickerViewController alloc]
          initForExportingURLs:@[file] asCopy:YES];
        picker.delegate = self;
        [presenter presentViewController:picker animated:YES completion:nil];
      });
    });
  });
}

- (BOOL)writePdf:(NSArray<NSDictionary *> *)rows toURL:(NSURL *)file
{
  NSMutableArray<NSDictionary *> *items = [NSMutableArray array];
  NSString *footer = nil;
  for (id entry in rows) {
    NSDictionary *row = ReportDictionary(entry);
    NSString *text = ReportText(row[@"text"]);
    if (!text) return NO;
    NSDictionary *content = ReportDictionary(row[@"content"]);
    NSString *kind = ReportText(content[@"kind"]);
    if ([kind isEqualToString:@"legacy"]) continue;
    if ([kind isEqualToString:@"footer"]) {
      footer = text;
      continue;
    }
    [items addObject:row];
  }
  if (!items.count) return NO;

  const CGFloat left = 40, width = 515, right = left + width;
  const CGFloat pageHeight = 842, bottom = pageHeight - 67;
  const CGFloat half = floor(width / 2);
  const CGRect page = CGRectMake(0, 0, 595, pageHeight);
  UIColor *ink = ReportColor(0x163049), *muted = ReportColor(0x607180);
  UIColor *accent = ReportColor(0x0070B9), *border = ReportColor(0xD7E1E9);
  UIColor *card = ReportColor(0xEEF6FC), *tagFill = ReportColor(0xEAF4FD);
  NSDictionary *body = ReportStyle(11, ink, NO, NSTextAlignmentLeft);
  NSDictionary *small = ReportStyle(10, muted, NO, NSTextAlignmentLeft);
  NSDictionary *section = ReportStyle(14, ink, YES, NSTextAlignmentLeft);
  NSDictionary *chip = ReportStyle(10, accent, YES, NSTextAlignmentLeft);
  NSDictionary *metric = ReportStyle(22, accent, YES, NSTextAlignmentLeft);
  NSDictionary *alert = ReportStyle(11, ReportColor(0xA32C30), YES, NSTextAlignmentLeft);
  NSDictionary *tableRight = ReportStyle(11, ink, NO, NSTextAlignmentRight);
  NSDictionary *alertRight = ReportStyle(11, ReportColor(0xA32C30), YES, NSTextAlignmentRight);
  NSDictionary *smallRight = ReportStyle(10, muted, NO, NSTextAlignmentRight);
  UIGraphicsPDFRenderer *renderer = [[UIGraphicsPDFRenderer alloc] initWithBounds:page];

  return [renderer writePDFToURL:file withActions:^(UIGraphicsPDFRendererContext *context) {
    [context beginPage];
    __block CGFloat currentY = left;
    void (^ensure)(CGFloat) = ^(CGFloat blockHeight) {
      if (currentY > left && currentY + blockHeight > bottom) {
        [context beginPage];
        currentY = left;
      }
    };
    void (^paragraph)(NSString *, NSDictionary *, CGFloat, CGFloat) =
      ^(NSString *text, NSDictionary *attrs, CGFloat gap, CGFloat reserve) {
        for (NSString *part in ReportTextParts(text, attrs, width, bottom - left)) {
          CGFloat height = ReportHeight(part, attrs, width);
          ensure(height + reserve);
          ReportDraw(part, attrs, CGRectMake(left, currentY, width, height));
          currentY += height + gap;
        }
      };
    CGFloat (^rowHeight)(NSString *, NSDictionary *, NSString *, NSDictionary *) =
      ^CGFloat(NSString *label, NSDictionary *labelStyle, NSString *value, NSDictionary *valueStyle) {
        return MAX(ReportHeight(label, labelStyle, half - 12), ReportHeight(value, valueStyle, half)) + 10;
      };
    void (^tableRow)(NSString *, NSDictionary *, NSString *, NSDictionary *) =
      ^(NSString *label, NSDictionary *labelStyle, NSString *value, NSDictionary *valueStyle) {
        CGFloat height = rowHeight(label, labelStyle, value, valueStyle);
        ReportDraw(label, labelStyle, CGRectMake(left, currentY + 4, half - 12, height - 10));
        ReportDraw(value, valueStyle, CGRectMake(right - half, currentY + 4, half, height - 10));
        currentY += height;
        ReportLine(left, right, currentY, border);
      };

    for (NSUInteger index = 0; index < items.count; index++) {
      NSDictionary *row = items[index];
      NSString *text = ReportText(row[@"text"]);
      NSString *role = ReportText(row[@"role"]);
      NSDictionary *data = ReportDictionary(row[@"content"]);
      NSString *kind = ReportText(data[@"kind"]);
      NSString *sectionTitle = nil;
      if ([role isEqualToString:@"section"] && index + 1 < items.count) {
        NSDictionary *next = items[index + 1];
        NSDictionary *nextData = ReportDictionary(next[@"content"]);
        if ([ReportText(nextData[@"kind"]) isEqualToString:@"urines"]) {
          sectionTitle = text;
          text = ReportText(next[@"text"]);
          data = nextData;
          kind = @"urines";
          index++;
        }
      }

      if ([kind isEqualToString:@"metric"]) {
        NSMutableArray<NSDictionary *> *metrics = [NSMutableArray arrayWithObject:data];
        NSDictionary *next = index + 1 < items.count ? ReportDictionary(items[index + 1][@"content"]) : nil;
        if ([ReportText(next[@"kind"]) isEqualToString:@"metric"]) {
          [metrics addObject:next];
          index++;
        }
        const CGFloat cardWidth = floor((width - 12) / 2), inner = cardWidth - 24;
        CGFloat blockHeight = 0;
        for (NSDictionary *entry in metrics) {
          blockHeight = MAX(blockHeight, 30 + ReportHeight(ReportText(entry[@"value"]), metric, inner)
            + ReportHeight(ReportText(entry[@"label"]), small, inner));
        }
        ensure(blockHeight);
        [metrics enumerateObjectsUsingBlock:^(NSDictionary *entry, NSUInteger column, BOOL *stop) {
          CGFloat x = left + column * (cardWidth + 12);
          NSString *value = ReportText(entry[@"value"]), *label = ReportText(entry[@"label"]);
          CGFloat valueHeight = ReportHeight(value, metric, inner);
          ReportRound(CGRectMake(x, currentY, cardWidth, blockHeight), card, NO);
          ReportDraw(value, metric, CGRectMake(x + 12, currentY + 10, inner, valueHeight));
          ReportDraw(label, small, CGRectMake(x + 12, currentY + 16 + valueHeight, inner, blockHeight - valueHeight - 16));
        }];
        currentY += blockHeight + 10;
      } else if ([kind isEqualToString:@"eyes"]) {
        const CGFloat inner = width - 24, chipHeight = 20, step = 25;
        NSMutableArray<NSMutableArray<NSDictionary *> *> *lines = [NSMutableArray array];
        CGFloat used = 0;
        for (id rawTag in ReportArray(data[@"tags"])) {
          NSString *tag = ReportText(rawTag);
          if (!tag.length) continue;
          for (NSString *part in ReportTextParts(tag, chip, inner - 20, chipHeight - 4)) {
            CGFloat tagWidth = MIN(inner, ceil([part sizeWithAttributes:chip].width) + 20);
            if (!lines.count || used + tagWidth > inner) {
              [lines addObject:[NSMutableArray array]];
              used = 0;
            }
            [lines.lastObject addObject:@{@"text": part, @"width": @(tagWidth)}];
            used += tagWidth + 6;
          }
        }
        if (!lines.count) {
          paragraph(text, section, 5, 0);
          continue;
        }
        CGFloat titleHeight = ReportHeight(text, section, inner), chrome = titleHeight + 26;
        NSUInteger capacity = (NSUInteger)MAX(1, floor((bottom - left - chrome) / step));
        for (NSUInteger offset = 0; offset < lines.count;) {
          NSUInteger count = MIN(capacity, lines.count - offset);
          CGFloat blockHeight = chrome + count * step;
          ensure(blockHeight);
          ReportRound(CGRectMake(left, currentY, width, blockHeight), border, YES);
          ReportDraw(text, section, CGRectMake(left + 12, currentY + 10, inner, titleHeight));
          for (NSUInteger line = 0; line < count; line++) {
            CGFloat x = left + 12, y = currentY + titleHeight + 16 + line * step;
            for (NSDictionary *tag in lines[offset + line]) {
              CGFloat tagWidth = [tag[@"width"] doubleValue];
              ReportRound(CGRectMake(x, y, tagWidth, chipHeight), tagFill, NO);
              ReportDraw(tag[@"text"], chip, CGRectMake(x + 10, y + 3, tagWidth - 18, chipHeight - 3));
              x += tagWidth + 6;
            }
          }
          currentY += blockHeight + 12;
          offset += count;
        }
      } else if ([kind isEqualToString:@"urines"]) {
        CGFloat titleHeight = ReportHeight(text, section, width);
        CGFloat headerHeight = titleHeight + 4 + rowHeight(@"검사항목", small, @"결과값", smallRight);
        CGFloat sectionHeight = sectionTitle.length ? ReportHeight(sectionTitle, section, width) + 8 : 0;
        CGFloat cellLimit = bottom - left - sectionHeight - headerHeight - 10;
        NSMutableArray<NSDictionary *> *cells = [NSMutableArray array];
        for (id rawResult in ReportArray(data[@"results"])) {
          NSDictionary *result = ReportDictionary(rawResult);
          NSString *label = ReportText(result[@"label"]), *value = ReportText(result[@"value"]);
          if (!label || !value) continue;
          NSDictionary *valueStyle = ReportFlag(result[@"isAbnormal"]) ? alertRight : tableRight;
          NSArray<NSString *> *labels = ReportTextParts(label, body, half - 12, cellLimit);
          NSArray<NSString *> *values = ReportTextParts(value, valueStyle, half, cellLimit);
          for (NSUInteger part = 0; part < MAX(labels.count, values.count); part++) {
            [cells addObject:@{@"label": part < labels.count ? labels[part] : @"",
              @"value": part < values.count ? values[part] : @"", @"style": valueStyle}];
          }
        }
        void (^header)(void) = ^{
          ReportDraw(text, section, CGRectMake(left, currentY, width, titleHeight));
          currentY += titleHeight + 4;
          tableRow(@"검사항목", small, @"결과값", smallRight);
        };
        NSDictionary *first = cells.firstObject;
        ensure(sectionHeight + (sectionHeight ? 12 : 0) + headerHeight +
          (first ? rowHeight(first[@"label"], body, first[@"value"], first[@"style"]) : 0));
        if (sectionTitle.length) {
          if (currentY > left) currentY += 12;
          ReportDraw(sectionTitle, section, CGRectMake(left, currentY, width, sectionHeight - 8));
          currentY += sectionHeight;
        }
        header();
        for (NSDictionary *cell in cells) {
          if (currentY + rowHeight(cell[@"label"], body, cell[@"value"], cell[@"style"]) > bottom) {
            [context beginPage];
            currentY = left;
            header();
          }
          tableRow(cell[@"label"], body, cell[@"value"], cell[@"style"]);
        }
        currentY += 10;
      } else if ([kind isEqualToString:@"walk"]) {
        NSString *label = ReportText(data[@"label"]), *value = ReportText(data[@"value"]);
        NSString *detail = ReportText(data[@"detail"]);
        NSDictionary *distance = ReportStyle(12, ink, YES, NSTextAlignmentRight);
        ensure(rowHeight(label, body, value, distance) + (detail.length ? ReportHeight(detail, small, width) + 6 : 0));
        tableRow(label, body, value, distance);
        if (detail.length) {
          currentY += 2;
          paragraph(detail, small, 4, 0);
        }
      } else if ([role isEqualToString:@"title"]) {
        paragraph(text, ReportStyle(26, ink, YES, NSTextAlignmentLeft), 9, 40);
      } else if ([role isEqualToString:@"pet"]) {
        paragraph(text, ReportStyle(14, ink, YES, NSTextAlignmentLeft), 4, 0);
      } else if ([role isEqualToString:@"period"]) {
        paragraph(text, small, 8, 8);
        ReportLine(left, right, currentY, accent);
        currentY += 12;
      } else if ([role isEqualToString:@"section"]) {
        NSDictionary *next = index + 1 < items.count ? ReportDictionary(items[index + 1][@"content"]) : nil;
        CGFloat reserve = [ReportText(next[@"kind"]) isEqualToString:@"eyes"] ? 82 : 36;
        ensure(ReportHeight(text, section, width) + 12 + 8 + reserve);
        if (currentY > left) currentY += 12;
        paragraph(text, section, 8, 0);
      } else if ([role isEqualToString:@"muted"]) {
        paragraph(text, small, 5, 0);
      } else if ([role isEqualToString:@"notice"] || [role isEqualToString:@"stage4"]) {
        paragraph(text, alert, 6, 0);
      } else if ([role isEqualToString:@"stage2"] || [role isEqualToString:@"stage3"]) {
        paragraph(text, ReportStyle(11, ReportColor(0x8C4E12), YES, NSTextAlignmentLeft), 5, 0);
      } else {
        paragraph(text, ReportFlag(row[@"heading"]) ? section : body, 8, 0);
      }
    }

    if (footer.length) {
      CGFloat height = ReportHeight(footer, small, width);
      CGFloat y = pageHeight - left - height;
      ReportLine(left, right, y - 7, border);
      ReportDraw(footer, small, CGRectMake(left, y, width, height));
    }
  } error:NULL];
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls
{
  RCTPromiseResolveBlock resolve = self.finish;
  [self clearExport];
  if (resolve) resolve(@(urls.count > 0));
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller
{
  RCTPromiseResolveBlock resolve = self.finish;
  [self clearExport];
  if (resolve) resolve(@NO);
}

@end
