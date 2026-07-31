// PROTOTYPE - NOT FOR PRODUCTION
// Question: Does every rendered frame keep the harpoon and rope animation valid, including the LOD variant?
// Date: 2026-07-31

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(prototypeRoot, "..", "..");
const require = createRequire(import.meta.url);
const { PNG } = require(path.join(repositoryRoot, "web", "node_modules", "pngjs"));

const variants = [
  {
    name: "original",
    telemetry: path.join(prototypeRoot, "analysis", "yaw_frame_telemetry.csv.txt"),
    verification: path.join(prototypeRoot, "analysis", "yaw_godot_verification.json"),
    keyframes: path.join(prototypeRoot, "screenshots", "yaw_frames"),
    movieFrames: path.join(prototypeRoot, "screenshots", "all_frames_yaw"),
  },
  {
    name: "lod",
    telemetry: path.join(prototypeRoot, "analysis", "yaw_lod_frame_telemetry.csv.txt"),
    verification: path.join(prototypeRoot, "analysis", "yaw_lod_godot_verification.json"),
    keyframes: path.join(prototypeRoot, "screenshots", "yaw_lod_frames"),
    movieFrames: path.join(prototypeRoot, "screenshots", "all_frames_yaw_lod"),
  },
];

function parseTelemetry(filePath) {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function listMovieFrames(directory) {
  return fs
    .readdirSync(directory)
    .filter((name) => /^frame\d{8}\.png$/.test(name))
    .sort()
    .map((name) => path.join(directory, name));
}

function listKeyframes(directory) {
  return fs
    .readdirSync(directory)
    .filter((name) => /^\d{2}_.+\.png$/.test(name))
    .sort()
    .map((name) => path.join(directory, name));
}

function imageStatistics(filePath) {
  const image = PNG.sync.read(fs.readFileSync(filePath));
  let sampleCount = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  for (let y = 0; y < image.height; y += 20) {
    for (let x = 0; x < image.width; x += 20) {
      const offset = (y * image.width + x) * 4;
      const luminance =
        image.data[offset] * 0.2126 +
        image.data[offset + 1] * 0.7152 +
        image.data[offset + 2] * 0.0722;
      sampleCount += 1;
      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
    }
  }
  const mean = luminanceSum / sampleCount;
  const variance = luminanceSquareSum / sampleCount - mean * mean;
  return {
    width: image.width,
    height: image.height,
    luminanceMean: mean,
    luminanceVariance: variance,
  };
}

function compareImages(originalPath, lodPath) {
  const original = PNG.sync.read(fs.readFileSync(originalPath));
  const lod = PNG.sync.read(fs.readFileSync(lodPath));
  if (original.width !== lod.width || original.height !== lod.height) {
    throw new Error(`Image dimensions differ: ${originalPath} vs ${lodPath}`);
  }
  let squaredError = 0;
  let absoluteError = 0;
  let channelCount = 0;
  for (let y = 160; y < original.height; y += 2) {
    for (let x = 0; x < original.width; x += 2) {
      const offset = (y * original.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = original.data[offset + channel] - lod.data[offset + channel];
        squaredError += difference * difference;
        absoluteError += Math.abs(difference);
        channelCount += 1;
      }
    }
  }
  const meanSquaredError = squaredError / channelCount;
  return {
    meanAbsoluteError: absoluteError / channelCount,
    meanSquaredError,
    psnrDb: meanSquaredError === 0 ? 99 : 10 * Math.log10((255 * 255) / meanSquaredError),
  };
}

function buildSideBySide(originalPath, lodPath, outputPath) {
  const original = PNG.sync.read(fs.readFileSync(originalPath));
  const lod = PNG.sync.read(fs.readFileSync(lodPath));
  const output = new PNG({ width: original.width * 2, height: original.height });
  PNG.bitblt(original, output, 0, 0, original.width, original.height, 0, 0);
  PNG.bitblt(lod, output, 0, 0, lod.width, lod.height, original.width, 0);
  fs.writeFileSync(outputPath, PNG.sync.write(output));
}

function analyzeVariant(variant) {
  const telemetry = parseTelemetry(variant.telemetry);
  const verification = JSON.parse(fs.readFileSync(variant.verification, "utf8"));
  const movieFrames = listMovieFrames(variant.movieFrames);
  const keyframes = listKeyframes(variant.keyframes);
  const imageChecks = movieFrames.map((framePath, index) => {
    const statistics = imageStatistics(framePath);
    const encodedIndex = Number(path.basename(framePath).match(/\d{8}/)[0]);
    return {
      index,
      encodedIndex,
      validDimensions: statistics.width === 1280 && statistics.height === 720,
      nonBlank: statistics.luminanceVariance > 50,
    };
  });

  let telemetrySequential = true;
  let timeMonotonic = true;
  let finiteValues = true;
  let previousTime = -Infinity;
  for (let index = 0; index < telemetry.length; index += 1) {
    const row = telemetry[index];
    const time = Number(row.time);
    telemetrySequential &&= Number(row.frame) === index;
    timeMonotonic &&= time >= previousTime;
    finiteValues &&= [
      row.time,
      row.delta_ms,
      row.yaw_degrees,
      row.extension,
      row.projectile_distance,
      row.rope_length,
      row.rope_start_error,
      row.rope_end_error,
      row.static_base_drift,
    ].every((value) => Number.isFinite(Number(value)));
    previousTime = time;
  }

  const movieSequential = imageChecks.every(
    (check) => check.encodedIndex === check.index,
  );
  const imagesValid = imageChecks.every(
    (check) => check.validDimensions && check.nonBlank,
  );
  const passed =
    verification.passed === true &&
    telemetry.length === verification.sample_count &&
    movieFrames.length >= telemetry.length &&
    movieFrames.length <= telemetry.length + 2 &&
    keyframes.length === verification.screenshots_expected &&
    telemetrySequential &&
    timeMonotonic &&
    finiteValues &&
    movieSequential &&
    imagesValid;

  return {
    name: variant.name,
    passed,
    godotVerificationPassed: verification.passed,
    telemetryFramesChecked: telemetry.length,
    movieFramesDecoded: movieFrames.length,
    keyframesDecoded: keyframes.length,
    telemetrySequential,
    timeMonotonic,
    finiteValues,
    movieSequential,
    imagesValid,
    firstMovieFrame: path.basename(movieFrames[0]),
    lastMovieFrame: path.basename(movieFrames.at(-1)),
  };
}

const variantResults = variants.map(analyzeVariant);
const originalKeyframes = listKeyframes(variants[0].keyframes);
const lodKeyframes = listKeyframes(variants[1].keyframes);
const visualComparisons = originalKeyframes.map((originalPath, index) => ({
  keyframe: path.basename(originalPath),
  ...compareImages(originalPath, lodKeyframes[index]),
}));
const averagePsnr =
  visualComparisons.reduce((sum, comparison) => sum + comparison.psnrDb, 0) /
  visualComparisons.length;
const maximumMeanAbsoluteError = Math.max(
  ...visualComparisons.map((comparison) => comparison.meanAbsoluteError),
);

const comparisonPath = path.join(
  prototypeRoot,
  "screenshots",
  "10_clean_yaw_original_vs_lod_full_extension.png",
);
const originalFullExtension = originalKeyframes.find((framePath) =>
  path.basename(framePath).includes("full_extension"),
);
const lodFullExtension = lodKeyframes.find((framePath) =>
  path.basename(framePath).includes("full_extension"),
);
if (!originalFullExtension || !lodFullExtension) {
  throw new Error("Full-extension keyframes are missing.");
}
buildSideBySide(originalFullExtension, lodFullExtension, comparisonPath);

const report = {
  passed:
    variantResults.every((result) => result.passed) &&
    averagePsnr >= 30 &&
    maximumMeanAbsoluteError <= 2,
  frameByFrameImagesDecoded: variantResults.reduce(
    (sum, result) => sum + result.movieFramesDecoded,
    0,
  ),
  telemetrySamplesChecked: variantResults.reduce(
    (sum, result) => sum + result.telemetryFramesChecked,
    0,
  ),
  variants: variantResults,
  lodVisualComparison: {
    keyframesCompared: visualComparisons.length,
    averagePsnrDb: averagePsnr,
    maximumMeanAbsoluteError,
    acceptanceThresholds: {
      minimumAveragePsnrDb: 30,
      maximumMeanAbsoluteError: 2,
    },
    frames: visualComparisons,
    sideBySideImage: comparisonPath,
  },
};

const outputPath = path.join(
  prototypeRoot,
  "analysis",
  "external_frame_verification.json",
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
