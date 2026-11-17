#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <CoreLocation/CoreLocation.h>
#import <AVFoundation/AVFoundation.h>
#import <ImageIO/ImageIO.h>
#import <UIKit/UIKit.h>
#import <math.h>

static NSURL *LocalMedia(NSString *path)
{
  NSURL *url = [path hasPrefix:@"file:"] ? [NSURL URLWithString:path] : [NSURL fileURLWithPath:path];
  if (!url.isFileURL || url.host.length > 0) return nil;
  url = url.URLByResolvingSymlinksInPath.URLByStandardizingPath;
  NSURL *caches = [[NSFileManager defaultManager] URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;
  NSURL *temp = [NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES];
  for (NSURL *root in @[temp, caches]) {
    NSString *prefix = [root.URLByResolvingSymlinksInPath.URLByStandardizingPath.path stringByAppendingString:@"/"];
    if ([url.path hasPrefix:prefix]) {
      NSNumber *regular = nil;
      return [url getResourceValue:&regular forKey:NSURLIsRegularFileKey error:nil] && regular.boolValue ? url : nil;
    }
  }
  return nil;
}

@interface RespirationFile : NSObject <RCTBridgeModule, NSURLSessionTaskDelegate>
@property (atomic, strong) NSURLSessionUploadTask *activeUpload;
@end

@implementation RespirationFile
RCT_EXPORT_MODULE(RespirationFile)
+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(size:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSNumber *size = nil;
  if (![LocalMedia(path) getResourceValue:&size forKey:NSURLFileSizeKey error:nil] || !size) {
    reject(@"FILE_ERROR", @"Cannot read video", nil);
    return;
  }
  resolve(size);
}

RCT_EXPORT_METHOD(discard:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *file = LocalMedia(path);
  NSString *extension = file.pathExtension.lowercaseString;
  if (file && [@[@"mov", @"mp4"] containsObject:extension]) {
    [[NSFileManager defaultManager] removeItemAtURL:file error:nil];
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(prepareGallery:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *file = LocalMedia(path);
  if (!file || ![file.pathExtension.lowercaseString isEqualToString:@"mov"]) {
    reject(@"FORMAT_ERROR", @"Cannot convert video", nil);
    return;
  }
  NSURL *output = [[NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES]
    URLByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingString:@".mp4"]];
  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:file options:nil];
  AVAssetExportSession *export = [[AVAssetExportSession alloc] initWithAsset:asset presetName:AVAssetExportPreset640x480];
  if (!export || ![export.supportedFileTypes containsObject:AVFileTypeMPEG4]) {
    reject(@"FORMAT_ERROR", @"Cannot convert video", nil);
    return;
  }
  export.outputURL = output;
  export.outputFileType = AVFileTypeMPEG4;
  [export exportAsynchronouslyWithCompletionHandler:^{
    if (export.status == AVAssetExportSessionStatusCompleted) {
      resolve(output.absoluteString);
      return;
    }
    [[NSFileManager defaultManager] removeItemAtURL:output error:nil];
    reject(@"FORMAT_ERROR", @"Cannot convert video", nil);
  }];
}

RCT_EXPORT_METHOD(upload:(NSString *)path signedURL:(NSString *)signedURL
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *file = LocalMedia(path);
  NSURL *url = [NSURL URLWithString:signedURL];
  if (!file || ![url.scheme.lowercaseString isEqualToString:@"https"] || !url.host.length ||
      url.user.length || url.password.length) {
    reject(@"UPLOAD_INVALID", @"Invalid video upload", nil);
    return;
  }
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"PUT";
  [request setValue:@"video/mp4" forHTTPHeaderField:@"Content-Type"];
  NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
  config.timeoutIntervalForRequest = 60;
  config.timeoutIntervalForResource = 180;
  config.HTTPShouldSetCookies = NO;
  config.URLCredentialStorage = nil;

  @synchronized (self) {
    if (self.activeUpload) {
      reject(@"UPLOAD_BUSY", @"Video upload already running", nil);
      return;
    }
    NSURLSession *session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];
    self.activeUpload = [session uploadTaskWithRequest:request fromFile:file
      completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        @synchronized (self) { self.activeUpload = nil; }
        [session finishTasksAndInvalidate];
        NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? [(NSHTTPURLResponse *)response statusCode] : 0;
        if (!error && status >= 200 && status < 300) resolve(@(status));
        else reject(@"UPLOAD_ERROR", @"Video upload failed", nil);
      }];
    [self.activeUpload resume];
  }
}

RCT_EXPORT_METHOD(cancelUpload) { [self.activeUpload cancel]; }

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task
  willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request
  completionHandler:(void (^)(NSURLRequest *))completionHandler
{
  completionHandler(nil);
}
@end

@interface DiagnosisImageCropper : NSObject <RCTBridgeModule>
@end

@implementation DiagnosisImageCropper
RCT_EXPORT_MODULE(DiagnosisImageCropper)
+ (BOOL)requiresMainQueueSetup { return NO; }

static NSURL *CropDirectory(void)
{
  NSURL *cache = [[NSFileManager defaultManager] URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;
  return [[cache URLByAppendingPathComponent:@"diagnosis-crops" isDirectory:YES] URLByResolvingSymlinksInPath];
}

RCT_EXPORT_METHOD(cropImage:(NSString *)path x:(double)x y:(double)y width:(double)width height:(double)height
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *file = LocalMedia(path);
  if (!file || !isfinite(x) || !isfinite(y) || !isfinite(width) || !isfinite(height) || width <= 0 || height <= 0) {
    reject(@"INVALID_IMAGE", @"Invalid crop input", nil);
    return;
  }
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)file, NULL);
  if (!source) { reject(@"INVALID_IMAGE", @"Cannot read image", nil); return; }
  NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
  CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)@{
    (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
    (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform: @YES,
    (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize: @2048,
  });
  CFRelease(source);

  double originalWidth = [properties[(__bridge NSString *)kCGImagePropertyPixelWidth] doubleValue];
  double originalHeight = [properties[(__bridge NSString *)kCGImagePropertyPixelHeight] doubleValue];
  NSInteger orientation = [properties[(__bridge NSString *)kCGImagePropertyOrientation] integerValue];
  if (orientation >= 5 && orientation <= 8) {
    double swap = originalWidth;
    originalWidth = originalHeight;
    originalHeight = swap;
  }
  if (!image || originalWidth <= 0 || originalHeight <= 0) {
    if (image) CGImageRelease(image);
    reject(@"INVALID_IMAGE", @"Cannot read image", nil);
    return;
  }
  double sx = CGImageGetWidth(image) / originalWidth, sy = CGImageGetHeight(image) / originalHeight;
  CGRect frame = CGRectIntersection(CGRectMake(0, 0, CGImageGetWidth(image), CGImageGetHeight(image)),
                                    CGRectIntegral(CGRectMake(x * sx, y * sy, width * sx, height * sy)));
  CGImageRef cropped = CGRectIsEmpty(frame) ? NULL : CGImageCreateWithImageInRect(image, frame);
  CGImageRelease(image);
  if (!cropped) { reject(@"CROP_FAILED", @"Cannot crop image", nil); return; }
  NSData *data = UIImageJPEGRepresentation([UIImage imageWithCGImage:cropped], 0.92);
  CGImageRelease(cropped);

  NSURL *directory = CropDirectory();
  NSURL *output = [directory URLByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingString:@".jpg"]];
  if (!data || ![[NSFileManager defaultManager] createDirectoryAtURL:directory withIntermediateDirectories:YES
                                                    attributes:nil error:nil] ||
      ![data writeToURL:output options:NSDataWritingAtomic error:nil]) {
    reject(@"SAVE_FAILED", @"Cannot save cropped image", nil);
    return;
  }
  resolve(output.absoluteString);
}

RCT_EXPORT_METHOD(discardCrop:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *file = LocalMedia(path);
  if (file && [file.URLByDeletingLastPathComponent.path isEqualToString:CropDirectory().path] &&
      [file.pathExtension isEqualToString:@"jpg"] &&
      [[NSUUID alloc] initWithUUIDString:file.URLByDeletingPathExtension.lastPathComponent]) {
    [[NSFileManager defaultManager] removeItemAtURL:file error:nil];
  }
  resolve(nil);
}
@end

@interface SmartHealthDogCompass : RCTEventEmitter <CLLocationManagerDelegate>
@property (nonatomic, strong) CLLocationManager *manager;
@end

@implementation SmartHealthDogCompass
RCT_EXPORT_MODULE(SmartHealthDogCompass)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[@"smartHealthDogCompassHeading"]; }

RCT_EXPORT_METHOD(start)
{
  if (self.manager || ![CLLocationManager headingAvailable]) return;
  self.manager = [[CLLocationManager alloc] init];
  self.manager.delegate = self;
  self.manager.headingFilter = 3;
  [self.manager startUpdatingHeading];
}

RCT_EXPORT_METHOD(stop)
{
  [self.manager stopUpdatingHeading];
  self.manager.delegate = nil;
  self.manager = nil;
}

- (void)stopObserving { [self stop]; }

- (void)locationManager:(CLLocationManager *)manager didUpdateHeading:(CLHeading *)value
{
  if (value.headingAccuracy < 0) return;
  CLLocationDirection heading = value.trueHeading >= 0 ? value.trueHeading : value.magneticHeading;
  if (heading >= 0) [self sendEventWithName:@"smartHealthDogCompassHeading" body:@{@"heading": @(heading)}];
}
@end
