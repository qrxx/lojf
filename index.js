const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/stream/:channel', (req, res) => {
  const channel = req.params.channel;

  // Validate the channel input to avoid injection or errors
  if (!/^\d+$/.test(channel)) {
    return res.status(400).send('Invalid channel number');
  }

  const rtspUrl = `rtsp://146.59.54.160/${channel}`;

  // Here is the key part — run ffmpeg on demand, but this is heavy!
  // Instead of saving to disk, we can stream it directly (better for low RAM)

  res.contentType('application/vnd.apple.mpegurl'); // m3u8 mime type

  ffmpeg(rtspUrl)
    .inputOptions('-rtsp_transport', 'tcp')
    .outputOptions([
      '-c:v copy',
      '-c:a aac',
      '-f hls',
      '-hls_time 10',
      '-hls_list_size 6',
      '-hls_flags delete_segments', // auto delete old segments to save disk
    ])
    .on('start', () => console.log(`FFmpeg started for channel ${channel}`))
    .on('error', (err) => {
      console.error('FFmpeg error:', err);
      res.status(500).send('Stream error');
    })
    .on('end', () => console.log(`FFmpeg finished for channel ${channel}`))
    .pipe(res, { end: true });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
