// Register the service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/js/service-worker.js')
      .then((registration) => {
        console.log(
          'ServiceWorker registration successful with scope: ',
          registration.scope,
        );
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

// DOM references
document.addEventListener('DOMContentLoaded', () => {
  // Main video/canvas
  const video = document.getElementById('video');

  if (!video) {
    console.error('Video element not found');
    return;
  }

  const recordCanvas = document.createElement('canvas');
  const overlayCanvas = document.getElementById('canvas');

  if (!overlayCanvas) {
    console.error('Overlay canvas element not found');
    return;
  }

  // const loader = document.getElementById('loader');
  const buttonsContainer = document.getElementById('buttons-container');
  const tapToRecordText = document.getElementById('tapToRecordText');
  const recordBeginBtn = document.getElementById('recordBeginBtn');

  // Additional controls
  const infoBtn = document.getElementById('infoBtn');
  const tweakBtn = document.getElementById('tweakBtn');
  const savedBtn = document.getElementById('savedBtn');
  const signinBtn = document.getElementById('signinBtn');

  // Modals
  const infoModal = document.getElementById('infoModal');
  const tweakModal = document.getElementById('tweakModal');
  const savedModal = document.getElementById('savedModal');
  const signinModal = document.getElementById('signinModal');
  const qrCodeImg = document.getElementById('qrCode');
  const closeModalBtn = document.getElementById('closeModal');
  const closeTweakModalBtn = document.getElementById('closeTweakModal');
  const closeSavedModalBtn = document.getElementById('closeSavedModal');
  const closeSigninModalBtn = document.getElementById('closeSigninModal');

  // Saved videos + progress
  const savedVideosContainer = document.getElementById('savedVideosContainer');
  const dropzoneFile = document.getElementById('videoUpload');

  // Flags & State
  let cameraInitialized = false;
  let mediaRecorder;
  let recordedChunks = [];
  let savedVideos = []; // local array of { id, url }
  let isRecording = false;

  let model;
  let detectionInterval;
  let boundingBoxes = [];

  // Function to check if the device is likely a mobile device
  function isMobileDevice() {
    // Check if the screen width is less than or equal to a typical mobile device width
    const isMobileWidth = window.innerWidth <= 768;

    // Check if the user agent matches common mobile device patterns
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

    return isMobileWidth && isMobileUserAgent;
  }

  // Function to setup the camera
  async function setupCamera() {
    if (cameraInitialized) return;
    cameraInitialized = true;

    try {
      const constraints = {
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      video.srcObject = stream;
      video.onloadedmetadata = async () => {
        video.play();

        // loader.classList.add('hidden');
        video.classList.remove('hidden');
        buttonsContainer.classList.remove('opacity-0', 'pointer-events-none');
        buttonsContainer.classList.add('opacity-100', 'pointer-events-auto');
        tapToRecordText.classList.remove('opacity-0');
        setTimeout(() => tapToRecordText.classList.add('opacity-0'), 3000);

        // Dimensions for invisible "recording" canvas
        recordCanvas.width = video.videoWidth;
        recordCanvas.height = video.videoHeight;
        // The visible overlay canvas for bounding boxes
        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;

        // Merged stream: raw camera frames + audio
        const finalStream = new MediaStream();
        // recordCanvas will draw raw frames from the <video> without bounding boxes
        recordCanvas
          .captureStream(30)
          .getVideoTracks()
          .forEach((t) => finalStream.addTrack(t));
        stream.getAudioTracks().forEach((t) => finalStream.addTrack(t));

        // Setup MediaRecorder on finalStream
        mediaRecorder = new MediaRecorder(finalStream, {
          mimeType: 'video/mp4',
        });
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          // Once user stops recording, we produce a final blob
          const blob = new Blob(recordedChunks, { type: 'video/mp4' });
          const videoURL = URL.createObjectURL(blob);

          // Immediately upload to /analyze, handle progress + server response
          sendVideoWithProgress(blob, videoURL);

          // Clear recordedChunks for next time
          recordedChunks = [];
        };

        // Load COCO-SSD
        model = await cocoSsd.load();
        // Start detection interval
        detectionInterval = setInterval(detectFrame, 300);
        // Start drawing loops
        requestAnimationFrame(drawOverlayLoop);
        requestAnimationFrame(drawRecordLoop);
      };
    } catch (err) {
      console.error('Camera error:', err);
    }
  }

  /**
   * detectFrame: run COCO-SSD detection every 300ms. boundingBoxes gets updated.
   */
  async function detectFrame() {
    if (!model || !video.videoWidth || !video.videoHeight) return;
    const predictions = await model.detect(video);
    boundingBoxes = predictions
      .filter((p) => p.class === 'dog')
      .map((p) => p.bbox); // [x, y, w, h]
  }

  /**
   * drawOverlayLoop: draws bounding boxes on overlayCanvas for user only, not recorded.
   */
  function drawOverlayLoop() {
    const overlayCtx = overlayCanvas.getContext('2d');
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    overlayCtx.globalAlpha = 0.2;
    overlayCtx.drawImage(
      video,
      0,
      0,
      overlayCanvas.width,
      overlayCanvas.height,
    );
    overlayCtx.globalAlpha = 1.0;

    // Draw bounding boxes from boundingBoxes array
    boundingBoxes.forEach(([x, y, w, h]) => {
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.5)';
      overlayCtx.lineWidth = 1.5;
      overlayCtx.fillStyle = 'rgba(147,197,117,0.1)';
      overlayCtx.beginPath();
      const r = 5;
      overlayCtx.moveTo(x + r, y);
      overlayCtx.arcTo(x + w, y, x + w, y + r, r);
      overlayCtx.arcTo(x + w, y + h, x + w - r, y + h, r);
      overlayCtx.arcTo(x, y + h, x, y + h - r, r);
      overlayCtx.arcTo(x, y, x + r, y, r);
      overlayCtx.closePath();
      overlayCtx.fill();
      overlayCtx.stroke();

      // label
      overlayCtx.font = '12px Arial';
      overlayCtx.fillStyle = 'white';
      overlayCtx.fillText('dog', x, y > 10 ? y - 5 : 10);
    });
    requestAnimationFrame(drawOverlayLoop);
  }

  /**
   * drawRecordLoop: draws the raw camera feed onto recordCanvas (no bounding boxes).
   */
  function drawRecordLoop() {
    const rc = recordCanvas.getContext('2d');
    rc.clearRect(0, 0, recordCanvas.width, recordCanvas.height);
    rc.drawImage(video, 0, 0, recordCanvas.width, recordCanvas.height);
    requestAnimationFrame(drawRecordLoop);
  }

  /**
   * Tap-to-record logic: toggles mediaRecorder start/stop.
   */
  recordBeginBtn.addEventListener('click', () => {
    if (!isRecording) {
      recordedChunks = [];
      mediaRecorder.start();
      isRecording = true;
      recordBeginBtn.innerHTML =
        '<img src="icons/recordStopBtn.svg" alt="Stop" class="w-1/2 h-1/2 relative">';
      recordBeginBtn.style.backgroundColor = '#CC5500';
      recordBeginBtn.style.animation = 'pulse 1s infinite';
    } else {
      mediaRecorder.stop();
      isRecording = false;
      recordBeginBtn.innerHTML =
        '<img src="icons/recordBeginBtn.svg" alt="Record" class="w-1/2 h-1/2 relative">';
      recordBeginBtn.style.backgroundColor = '#93C575';
      recordBeginBtn.style.animation = 'none';
    }
  });

  /**
   * sendVideoWithProgress: uploads the video to /analyze with a progress bar,
   * then uses the server's response to store in IndexedDB with the same ID.
   */
  function sendVideoWithProgress(videoBlob, videoURL) {
    const formData = new FormData();
    formData.append('video', videoBlob, 'recording.mp4');

    // Create a tile in "Saved Videos" for this video
    // with a progress bar
    const tile = document.createElement('div');
    tile.className = 'flex items-center border p-2 rounded mb-4';

    const progressContainer = document.createElement('div');
    progressContainer.className = 'w-full bg-gray-200 h-4 rounded mt-2';
    const progressBar = document.createElement('div');
    progressBar.style.width = '0%';
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = '#93C575';
    progressBar.classList.add('transition-all');
    progressContainer.appendChild(progressBar);

    tile.appendChild(progressContainer);
    savedVideosContainer.appendChild(tile);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/analyze', true);

    // Update progress bar
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        progressBar.style.width = percent + '%';
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        // Server returns JSON with { upload_id, ... }
        try {
          const res = JSON.parse(xhr.responseText);
          const serverId = res.upload_id;
          const timestamp = res.timestamp;
          // Now store in local array and IndexedDB, using serverId as the key
          savedVideos.push({ id: serverId, url: videoURL });
          saveVideoToDB(videoBlob, videoURL, serverId, timestamp);
          displaySavedVideos();
        } catch (err) {
          console.error('Could not parse server response:', err);
        }
      } else {
        console.error('Upload failed with status', xhr.status);
        progressBar.style.backgroundColor = 'red';
      }
    };

    xhr.onerror = () => {
      console.error('Upload failed');
      progressBar.style.backgroundColor = 'red';
      const errorMsg = document.createElement('span');
      errorMsg.textContent = 'Upload failed. Try again.';
      errorMsg.className = 'text-sm text-red-600 ml-2';
      tile.appendChild(errorMsg);
    };

    xhr.send(formData);
  }

  // Standard modals + menus
  if (infoBtn) {
    infoBtn.addEventListener('click', () => {
      qrCodeImg.src =
        'https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=93C575&data=' +
        encodeURIComponent(window.location.href);
      infoModal.classList.remove('hidden');
    });
  }
  if (tweakBtn)
    tweakBtn.addEventListener('click', () =>
      tweakModal.classList.remove('hidden'),
    );
  if (savedBtn) {
    savedBtn.addEventListener('click', () => {
      savedModal.classList.remove('hidden');
      displaySavedVideos();
    });
  }
  if (signinBtn)
    signinBtn.addEventListener('click', () =>
      signinModal.classList.remove('hidden'),
    );

  if (closeModalBtn)
    closeModalBtn.addEventListener('click', () =>
      infoModal.classList.add('hidden'),
    );
  if (closeTweakModalBtn)
    closeTweakModalBtn.addEventListener('click', () =>
      tweakModal.classList.add('hidden'),
    );
  if (closeSavedModalBtn)
    closeSavedModalBtn.addEventListener('click', () =>
      savedModal.classList.add('hidden'),
    );
  if (closeSigninModalBtn)
    closeSigninModalBtn.addEventListener('click', () =>
      signinModal.classList.add('hidden'),
    );

  // IndexedDB logic
  openDatabase()
    .then(() => {
      // Create and append loading spinner below the video list
      const spinner = document.createElement('div');

      spinner.id = 'videoListSpinner';
      spinner.className = 'w-full flex justify-center my-4';
      spinner.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#93C575]"></div>
      `;

      loadVideosFromDB((records) => {
        savedVideos = records.map((r) => ({
          id: r.id,
          url: URL.createObjectURL(r.blob),
          created: r.created,
        }));

        const existingSpinner = document.getElementById('videoListSpinner');

        if (existingSpinner) existingSpinner.remove();

        displaySavedVideos();
      });
    })
    .catch((err) => console.error('IndexedDB error:', err));

  function displaySavedVideos() {
    savedVideosContainer.innerHTML = '';
    if (!savedVideos.length) {
      savedVideosContainer.innerHTML = `
          <br>
          <div class="flex items-center justify-center w-full">
            <label for="videoUpload"
              class="flex flex-col items-center justify-center w-full h-[calc(100% - 20vh)]
              border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div class="flex flex-col items-center justify-center pt-5 pb-6 w-full h-full">
                <svg class="w-8 h-8 mb-4 text-gray-500" aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5
                       5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5
                       a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                </svg>
                <p>Click to upload</p>
              </div>
              <input id="videoUpload" type="file" class="hidden" />
            </label>
          </div>
          <br>
          <p>No saved videos yet.</p>
        `;
      return;
    }

    // For each saved video
    savedVideos.forEach(({ id, url, created }) => {
      const wrapper = document.createElement('div');
      wrapper.className =
        'flex items-center justify-between mb-4 p-2 border rounded';

      const thumbnail = document.createElement('video');
      thumbnail.src = url;
      thumbnail.className = 'w-16 h-16 object-cover rounded';
      thumbnail.muted = true;

      const title = document.createElement('span');
      title.className = 'flex-1 ml-4 text-sm';

      // Format timestamp (created might be a numeric timestamp or full Date)
      // If it's numeric (Unix), do:
      const dt = created ? new Date(created) : new Date();
      title.textContent = `Video from ${dt.toLocaleString()} (Id ${id})`;

      const playBtn = document.createElement('button');
      playBtn.innerHTML =
        '<img src="icons/playVideoBtn.svg" alt="Play" class="w-8 h-8 mr-4">';
      playBtn.addEventListener('click', () => {
        const vid = document.createElement('video');
        vid.src = url;
        vid.controls = true;
        vid.className =
          'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-xl z-50';
        document.body.appendChild(vid);
        vid.play();
        vid.addEventListener('ended', () => document.body.removeChild(vid));
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML =
        '<img src="icons/removeItemBtn.svg" alt="Delete" class="w-8 h-8 mr-4">';
      deleteBtn.addEventListener('click', () => {
        // Remove from local array
        savedVideos = savedVideos.filter((v) => v.id !== id);
        // Delete from IndexedDB
        deleteVideoFromDB(id);
        // Update UI
        displaySavedVideos();

        // Now request the back-end to remove the entire folder
        fetch('/delete_video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_id: id.toString() }),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Server delete failed');
            return res.json();
          })
          .then((data) => {
            console.log('Deleted on server too:', data);
          })
          .catch((err) => {
            console.error('Error deleting on server:', err);
            // Optionally revert local deletion or show a message
          });
      });

      wrapper.append(thumbnail, title, playBtn, deleteBtn);
      savedVideosContainer.appendChild(wrapper);
    });
  }

  // File upload for manual uploads
  if (dropzoneFile) {
    dropzoneFile.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file && file.type.match('video.*')) {
        const reader = new FileReader();
        reader.onload = function (e) {
          const videoBlob = new Blob([e.target.result], { type: file.type });
          const videoUrl = URL.createObjectURL(videoBlob);

          // For manual uploads, you might want to also do the same 'upload to server'
          // or simply store locally if you want.
          // Example:
          sendVideoWithProgress(videoBlob, videoUrl);
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }

  // Android install prompt
  let deferredPrompt;
  const installButton = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installButton) {
      installButton.style.display = 'block';
      installButton.addEventListener('click', () => {
        installButton.style.display = 'none';
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((result) => {
          console.log(
            result.outcome === 'accepted'
              ? 'User accepted the prompt'
              : 'User dismissed the prompt',
          );
          deferredPrompt = null;
        });
      });
    }
  });

  // Start camera feed once page loads
  setupCamera();

  // Request persistent storage
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((granted) => {
      console.log('Persistent storage granted:', granted);
    });
  }
});
