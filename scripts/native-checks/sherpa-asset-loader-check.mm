// Host-side check for SherpaOnnxAssetLoader's root-path handling.
//
// The loader is Foundation-only, so it compiles and runs on macOS without a
// device, a simulator, or any sherpa-onnx dependency. That makes the one
// behaviour we cannot otherwise test cheaply, how an absolute modelAssetKey is
// classified, checkable without a build.
//
// Why this exists: the on-demand model bundle is downloaded to an absolute
// filesystem path and passed straight through as modelAssetKey (see
// src/public/voice-activator.ts). A bug that mangles absolute roots therefore
// breaks the DEFAULT iOS flow while leaving the bundled-asset flow, which the
// example app uses, working, so device testing does not catch it.
#import <Foundation/Foundation.h>
#import "SherpaOnnxAssetLoader.h"

static int gFailures = 0;

static void Check(BOOL condition, NSString *what)
{
  if (condition) {
    fprintf(stdout, "  ok   %s\n", what.UTF8String);
  } else {
    fprintf(stdout, "  FAIL %s\n", what.UTF8String);
    gFailures += 1;
  }
}

/// Writes the minimum file set loadAssetPathsWithModelAssetKey looks for.
static NSString *MakeModelDirectory(void)
{
  NSString *dir = [NSTemporaryDirectory()
      stringByAppendingPathComponent:[NSString stringWithFormat:@"va-loader-%@",
                                                                [[NSUUID UUID] UUIDString]]];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:NULL];
  for (NSString *name in @[ @"encoder.onnx", @"decoder.onnx", @"joiner.onnx", @"tokens.txt",
                            @"keywords.txt", @"bpe.model", @"generated-keywords.txt" ]) {
    [[NSData data] writeToFile:[dir stringByAppendingPathComponent:name] atomically:YES];
  }
  return dir;
}

int main(void)
{
  @autoreleasepool {
    SherpaOnnxAssetLoader *loader = [[SherpaOnnxAssetLoader alloc] init];
    NSString *dir = MakeModelDirectory();

    fprintf(stdout, "absolute modelAssetKey (the on-demand model bundle):\n");
    NSError *error = nil;
    SherpaOnnxAssetPaths *paths = [loader loadAssetPathsWithModelAssetKey:dir
                                                         keywordAssetKey:nil
                                                         rawTextKeywords:NO
                                                                   error:&error];
    Check(paths != nil, @"resolves rather than erroring");
    if (paths != nil) {
      Check([paths.encoderPath
                isEqualToString:[dir stringByAppendingPathComponent:@"encoder.onnx"]],
            @"encoder path is the absolute file we created");
      Check([paths.tokensPath hasPrefix:@"/"], @"tokens path stays absolute");
    } else {
      fprintf(stdout, "       error: %s\n", error.localizedDescription.UTF8String);
    }

    fprintf(stdout, "absolute modelAssetKey with a trailing slash:\n");
    error = nil;
    paths = [loader loadAssetPathsWithModelAssetKey:[dir stringByAppendingString:@"/"]
                                    keywordAssetKey:nil
                                    rawTextKeywords:NO
                                              error:&error];
    Check(paths != nil, @"trailing slash is tolerated");

    fprintf(stdout, "file:// modelAssetKey:\n");
    error = nil;
    paths = [loader loadAssetPathsWithModelAssetKey:[NSString stringWithFormat:@"file://%@", dir]
                                    keywordAssetKey:nil
                                    rawTextKeywords:NO
                                              error:&error];
    Check(paths != nil, @"file:// root resolves");

    fprintf(stdout, "wakePhrase shape (raw-text keywords need bpe.model):\n");
    error = nil;
    paths = [loader
        loadAssetPathsWithModelAssetKey:dir
                        keywordAssetKey:[dir stringByAppendingPathComponent:
                                                 @"generated-keywords.txt"]
                        rawTextKeywords:YES
                                  error:&error];
    Check(paths != nil, @"absolute keyword path plus bpe.model resolves");
    if (paths != nil) {
      Check(paths.bpeVocabPath != nil && [paths.bpeVocabPath hasPrefix:@"/"],
            @"bpe.model path stays absolute");
    } else {
      fprintf(stdout, "       error: %s\n", error.localizedDescription.UTF8String);
    }

    fprintf(stdout, "a missing absolute root still fails, and says where:\n");
    error = nil;
    paths = [loader loadAssetPathsWithModelAssetKey:@"/nonexistent/va-model-root"
                                    keywordAssetKey:nil
                                    rawTextKeywords:NO
                                              error:&error];
    Check(paths == nil, @"missing directory is an error");
    Check(error != nil &&
              [error.localizedDescription containsString:@"/nonexistent/va-model-root"],
          @"the error names the absolute path that was tried");

    [[NSFileManager defaultManager] removeItemAtPath:dir error:NULL];

    if (gFailures > 0) {
      fprintf(stdout, "\n%d check(s) failed.\n", gFailures);
      return 1;
    }
    fprintf(stdout, "\nAll SherpaOnnxAssetLoader root-path checks passed.\n");
    return 0;
  }
}
