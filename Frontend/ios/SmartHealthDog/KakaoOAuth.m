#import <React/RCTBridgeModule.h>
#import <Security/Security.h>

@interface KakaoOAuth : NSObject <RCTBridgeModule>
@end

@implementation KakaoOAuth

RCT_EXPORT_MODULE(KakaoOAuth)

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(createState:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  uint8_t bytes[32];
  if (SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes) != errSecSuccess) {
    reject(@"RANDOM_UNAVAILABLE", @"OAuth state unavailable", nil);
    return;
  }
  NSData *data = [NSData dataWithBytes:bytes length:sizeof(bytes)];
  NSString *state = [[data base64EncodedStringWithOptions:0] stringByReplacingOccurrencesOfString:@"+" withString:@"-"];
  state = [state stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
  resolve([state stringByReplacingOccurrencesOfString:@"=" withString:@""]);
}

@end
