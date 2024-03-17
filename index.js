const fs = require('fs');
const ytdl = require('ytdl-core');
const readline = require('readline');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function downloadVideo(url) {
  try {
    const info = await ytdl.getInfo(url);
    const mp4Formats = ytdl.filterFormats(info.formats, 'video').filter(format => format.container === 'mp4' && format.hasVideo);

    if (mp4Formats.length === 0) {
      console.log('No MP4 video resolutions available for this video.');
      rl.close();
      return;
    }

    const qualityOptions = mp4Formats.map((format, index) => `${index + 1}. ${format.qualityLabel}`);
    console.log(`Available MP4 video resolutions for ${info.videoDetails.title}:`);
    console.log(qualityOptions.join('\n'));

    const selectedIndex = await promptResolution(qualityOptions.length);
    const selectedVideoFormat = mp4Formats[selectedIndex];
    const audioFormat = ytdl.filterFormats(info.formats, 'audioonly').find(format => format.hasAudio);

    const videoFilename = `${info.videoDetails.title.replace(/[^a-zA-Z0-9 ]/g, '')} (${selectedVideoFormat.qualityLabel}).mp4`;
    const tempAudioFilename = `${info.videoDetails.title.replace(/[^a-zA-Z0-9 ]/g, '')}.${audioFormat.container}`;
    const outputFilename = `${info.videoDetails.title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp4`;

    await Promise.all([
      downloadStream(ytdl.downloadFromInfo(info, { format: selectedVideoFormat }), videoFilename),
      downloadStream(ytdl(url, { quality: audioFormat.itag }), tempAudioFilename)
    ]);

    await mergeVideoAudio(videoFilename, tempAudioFilename, outputFilename);
    fs.unlinkSync(videoFilename);
    fs.unlinkSync(tempAudioFilename);
    rl.close();
  } catch (err) {
    console.error('Error:', err);
    rl.close();
  }
}

function downloadStream(stream, filename) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filename);
    stream.pipe(writeStream);
    console.log(`Downloading ${filename}...`);
    writeStream.on('finish', () => {
      console.log(`Downloaded ${filename}`);
      resolve();
    });
    writeStream.on('error', err => {
      reject(err);
    });
  });
}

function mergeVideoAudio(videoFile, audioFile, outputFile) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoFile)
      .input(audioFile)
      .outputOptions(['-c:v copy', '-c:a aac', '-strict experimental'])
      .output(outputFile)
      .on('end', () => {
        console.log(`Downloaded ${outputFile}`);
        resolve();
      })
      .on('error', err => {
        reject(err);
      })
      .run();
  });
}

function promptResolution(numOptions) {
  return new Promise(resolve => {
    const question = `Enter the number corresponding to the desired resolution (1-${numOptions}):`;
    rl.question(question, answer => {
      const selectedIndex = parseInt(answer, 10) - 1;
      if (selectedIndex >= 0 && selectedIndex < numOptions) {
        resolve(selectedIndex);
      } else {
        console.log('Invalid selection. Please try again.');
        promptResolution(numOptions).then(resolve);
      }
    });
  });
}

rl.question('Enter the YouTube video URL: ', url => {
  downloadVideo(url);
});