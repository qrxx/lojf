const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

// Serve the HLS files for the selected channel
app.get('/stream/:channel', (req, res) => {
  const channel = req.params.channel;
  if (!/^\d+$/.test(channel)) {
    return res.status(400).send('Invalid channel number');
  }

  // Folder to save HLS files for this channel
  const outputFolder = `public/hls_${channel}`;

  // Check if the playlist already exists, if so, serve it directly
  const playlistPath = `${outputFolder}/output.m3u8`;
  if (fs.existsSync(playlistPath)) {
    return res.sendFile(playlistPath, { root: '.' });
  }

  // Make sure output folder exists
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  // Start ffmpeg to generate HLS for this channel
  ffmpeg(`rtsp://146.59.54.160/${channel}`)
    .inputOptions('-rtsp_transport', 'tcp')
    .outputOptions([
      '-c:v copy',
      '-c:a aac',
      '-f hls',
      '-hls_time 10',
      '-hls_list_size 6',
      `-hls_segment_filename ${outputFolder}/output%d.ts`
    ])
    .output(`${outputFolder}/output.m3u8`)
    .on('start', () => console.log(`FFmpeg started for channel ${channel}`))
    .on('error', (err) => {
      console.error(`FFmpeg error for channel ${channel}:`, err);
      res.status(500).send('Stream error');
    })
    .on('end', () => console.log(`FFmpeg finished for channel ${channel}`))
    .run();

  // Give some time for playlist generation, then serve it (could be improved with better syncing)
  setTimeout(() => {
    if (fs.existsSync(playlistPath)) {
      res.sendFile(playlistPath, { root: '.' });
    } else {
      res.status(503).send('Stream is starting, try again shortly');
    }
  }, 3000); // wait 3 seconds
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
