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

// Get references to DOM elements
document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('video');
  const loader = document.getElementById('loader');
  const buttonsContainer = document.getElementById('buttons-container');
  const tapToRecordText = document.getElementById('tapToRecordText');

  const infoBtn = document.getElementById('infoBtn');
  const tweakBtn = document.getElementById('tweakBtn');
  const recordBeginBtn = document.getElementById('recordBeginBtn');
  const savedBtn = document.getElementById('savedBtn');
  const signinBtn = document.getElementById('signinBtn');

  // Modal elements
  const infoModal = document.getElementById('infoModal');
  const tweakModal = document.getElementById('tweakModal');
  const savedModal = document.getElementById('savedModal');
  const signinModal = document.getElementById('signinModal');

  const qrCodeImg = document.getElementById('qrCode');
  const closeModalBtn = document.getElementById('closeModal');
  const closeTweakModalBtn = document.getElementById('closeTweakModal');
  const closeSavedModalBtn = document.getElementById('closeSavedModal');
  const closeSigninModalBtn = document.getElementById('closeSigninModal');
  const savedVideosContainer = document.getElementById('savedVideosContainer');
  const dropzoneFile = document.getElementById('videoUpload');

  // Flag to ensure the camera is only initialized once.
  let cameraInitialized = false;
  let mediaRecorder;
  let recordedChunks = [];
  let savedVideos = [];
  let isRecording = false;
  let isLongPress = false;
  let model;

  /**
   * Sets up the camera stream.
   */
  async function setupCamera() {
    if (cameraInitialized) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error('getUserMedia not supported on your browser!');
      return;
    }

    try {
      const constraints = {
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      handleCameraStream(stream);
    } catch (error) {
      console.error('Error accessing the camera:', error);
    }
  }

  /**
   * Handles the camera stream once access is granted.
   * @param {MediaStream} stream - The camera stream.
   */
  async function handleCameraStream(stream) {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.classList.remove('hidden');
      loader.classList.add('hidden');
      buttonsContainer.classList.remove('opacity-0', 'pointer-events-none');
      buttonsContainer.classList.add('opacity-100', 'pointer-events-auto');
      tapToRecordText.classList.remove('opacity-0');
      setTimeout(() => {
        tapToRecordText.classList.add('opacity-0');
      }, 3000);

      // Use the existing canvas element from the HTML
      const canvas = document.getElementById('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      const dogWatermark = new Image();
      dogWatermark.src = 'icons/watermark.dog.svg';
      const pn1Watermark = new Image();
      pn1Watermark.src = 'icons/watermark.PN1.svg';

      Promise.all([
        new Promise((resolve) => (dogWatermark.onload = resolve)),
        new Promise((resolve) => (pn1Watermark.onload = resolve)),
      ]).then(async () => {
        model = await cocoSsd.load();

        function drawCanvasFrame() {
          if (!video.videoWidth || !video.videoHeight) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 0.2;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.drawImage(dogWatermark, 8, 8, 64, 64);
          ctx.drawImage(pn1Watermark, 80, 13, 108, 54);
          ctx.globalAlpha = 1.0;
          detectFrame(video, model, ctx);
          requestAnimationFrame(drawCanvasFrame);
        }

        drawCanvasFrame();
      });

      // Capture the stream from the existing canvas
      const canvasStream = canvas.captureStream(75);
      mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: 'video/mp4',
      });
      mediaRecorder.ondataavailable = function (event) {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      mediaRecorder.onstop = function () {
        const blob = new Blob(recordedChunks, { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        saveVideoToDB(blob, url);
        // Refresh the saved videos list to capture the new record's id.
        loadVideosFromDB((records) => {
          savedVideos = records.map((record) => ({
            id: record.id,
            url: URL.createObjectURL(record.blob),
          }));
          displaySavedVideos();
        });
        recordedChunks = [];
      };
      mediaRecorder.onerror = function (event) {
        console.error('MediaRecorder error:', event.error);
      };
      mediaRecorder.onstart = function () {
        console.log('Recording started.');
      };
    };
  }

  async function detectFrame(video, model, ctx) {
    const predictions = await model.detect(video);

    // Clear and redraw the video frame
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);

    predictions.forEach((prediction) => {
      const [x, y, width, height] = prediction.bbox;

      if (
        x >= 0 &&
        y >= 0 &&
        width > 0 &&
        height > 0 &&
        prediction.class === 'dog'
      ) {
        const cornerRadius = 5; // Radius for rounded corners

        // Set line style
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; // Semi-transparent white
        ctx.lineWidth = 1.5; // Thinner line
        ctx.lineJoin = 'round'; // Smoother corners
        ctx.lineCap = 'round';

        // Set fill style
        ctx.fillStyle = 'rgba(147, 197, 117, 0.1)'; // 10% opacity 93C575 color

        // Draw rounded rectangle with fill
        ctx.beginPath();
        ctx.moveTo(x + cornerRadius, y);
        ctx.arcTo(x + width, y, x + width, y + cornerRadius, cornerRadius);
        ctx.arcTo(
          x + width,
          y + height,
          x + width - cornerRadius,
          y + height,
          cornerRadius,
        );
        ctx.arcTo(x, y + height, x, y + height - cornerRadius, cornerRadius);
        ctx.arcTo(x, y, x + cornerRadius, y, cornerRadius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // (Optional) Remove the following if you don’t want text labels:
        ctx.font = '12px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(prediction.class, x, y > 10 ? y - 10 : 10);
      } else {
        console.error('Invalid bounding box coordinates:', {
          x,
          y,
          width,
          height,
        });
      }
    });

    // Draw watermarks at the top-left corner
    const dogWatermark = new Image();
    dogWatermark.src = 'icons/watermark.dog.svg';
    const pn1Watermark = new Image();
    pn1Watermark.src = 'icons/watermark.PN1.svg';

    Promise.all([
      new Promise((resolve) => (dogWatermark.onload = resolve)),
      new Promise((resolve) => (pn1Watermark.onload = resolve)),
    ]).then(() => {
      ctx.drawImage(watermarkImg1, 8, 8, 64, 64);
      ctx.drawImage(watermarkImg2, 80, 8, 108, 54);
    });
  }

  // Display saved videos in the savedModal
  function displaySavedVideos() {
    savedVideosContainer.innerHTML = '';
    if (savedVideos.length === 0) {
      savedVideosContainer.innerHTML = `
        <br>
        <div class="flex items-center justify-center w-full">
          <label for="videoUpload" class="flex flex-col items-center justify-center w-full h-[calc(100% - 20vh)] border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
            <div class="flex flex-col items-center justify-center pt-5 pb-6 w-full h-full">
              <svg class="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
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

    savedVideos.forEach((videoObj, index) => {
      const { id, url } = videoObj;
      const listItem = document.createElement('div');
      listItem.classList.add(
        'flex',
        'items-center',
        'justify-between',
        'mb-4',
        'p-2',
        'border',
        'rounded',
      );

      const thumbnail = document.createElement('video');
      thumbnail.src = url;
      thumbnail.classList.add('w-16', 'h-16', 'object-cover', 'rounded');
      thumbnail.muted = true;

      const title = document.createElement('span');
      title.classList.add('flex-1', 'ml-4', 'text-sm');
      title.textContent = `Video ${index + 1}`;

      const playButton = document.createElement('button');
      playButton.classList.add(
        'ml-2',
        'text-green-500',
        'hover:text-green-700',
      );
      playButton.innerHTML =
        '<img src="icons/playVideoBtn.svg" alt="Play" class="w-8 h-8 mr-4">';
      playButton.addEventListener('click', () => {
        const videoPlayer = document.createElement('video');
        videoPlayer.src = url;
        videoPlayer.controls = true;
        videoPlayer.classList.add(
          'fixed',
          'top-1/2',
          'left-1/2',
          'transform',
          '-translate-x-1/2',
          '-translate-y-1/2',
          'w-full',
          'max-w-xl',
          'z-50',
        );
        document.body.appendChild(videoPlayer);
        videoPlayer.play();
        videoPlayer.addEventListener('ended', () => {
          document.body.removeChild(videoPlayer);
        });
      });

      const deleteButton = document.createElement('button');
      deleteButton.classList.add('ml-2', 'text-red-500', 'hover:text-red-700');
      deleteButton.innerHTML =
        '<img src="icons/removeItemBtn.svg" alt="Delete" class="w-8 h-8 mr-4">';
      deleteButton.addEventListener('click', () => {
        // Remove from the in-memory array and delete from IndexedDB using the id
        savedVideos.splice(index, 1);
        deleteVideoFromDB(id);
        displaySavedVideos();
      });

      listItem.appendChild(thumbnail);
      listItem.appendChild(title);
      listItem.appendChild(playButton);
      listItem.appendChild(deleteButton);

      savedVideosContainer.appendChild(listItem);
    });
  }

  // Event listeners for buttons.
  if (infoBtn) infoBtn.addEventListener('click', handleButtonClick);
  if (tweakBtn) tweakBtn.addEventListener('click', handleButtonClick);
  if (recordBeginBtn) {
    recordBeginBtn.addEventListener('click', handleButtonClick);
    recordBeginBtn.addEventListener('touchstart', handleTouchStart);
    recordBeginBtn.addEventListener('touchend', handleTouchEnd);
  }
  if (savedBtn) savedBtn.addEventListener('click', handleButtonClick);
  if (signinBtn) signinBtn.addEventListener('click', handleButtonClick);

  function handleButtonClick(event) {
    const buttonId = event.currentTarget.id;
    switch (buttonId) {
      case 'infoBtn':
        qrCodeImg.src =
          'https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=93C575&data=' +
          encodeURIComponent(window.location.href);
        infoModal.classList.remove('hidden');
        break;
      case 'tweakBtn':
        tweakModal.classList.remove('hidden');
        break;
      case 'savedBtn':
        savedModal.classList.remove('hidden');
        displaySavedVideos();
        break;
      case 'signinBtn':
        signinModal.classList.remove('hidden');
        break;
    }
  }

  function handleTouchStart(event) {
    const buttonId = event.currentTarget.id;
    if (buttonId === 'recordBeginBtn') {
      console.log('Touch start: Record button pressed');
      isLongPress = true;
      setTimeout(() => {
        if (isLongPress && !isRecording) {
          console.log('Starting recording');
          recordedChunks = [];
          mediaRecorder.start();
          isRecording = true;
          recordBeginBtn.innerHTML =
            '<img src="icons/recordStopBtn.svg" alt="Stop" class="w-1/2 h-1/2 relative">';
          recordBeginBtn.style.backgroundColor = '#CC5500';
          recordBeginBtn.style.animation = 'pulse 1s infinite';
        }
      }, 300); // Adjust the delay as needed
    }
  }

  function handleTouchEnd(event) {
    const buttonId = event.currentTarget.id;
    if (buttonId === 'recordBeginBtn') {
      console.log('Touch end: Record button released');
      isLongPress = false;
      if (isRecording) {
        console.log('Stopping recording');
        mediaRecorder.stop();
        isRecording = false;
        recordBeginBtn.innerHTML =
          '<img src="icons/recordBeginBtn.svg" alt="Record" class="w-1/2 h-1/2 relative">';
        recordBeginBtn.style.backgroundColor = '#93C575';
        recordBeginBtn.style.animation = 'none';
      }
    }
  }

  if (closeModalBtn)
    closeModalBtn.addEventListener('click', () => {
      infoModal.classList.add('hidden');
    });

  if (closeTweakModalBtn)
    closeTweakModalBtn.addEventListener('click', () => {
      tweakModal.classList.add('hidden');
    });

  if (closeSavedModalBtn)
    closeSavedModalBtn.addEventListener('click', () => {
      savedModal.classList.add('hidden');
    });

  if (closeSigninModalBtn)
    closeSigninModalBtn.addEventListener('click', () => {
      signinModal.classList.add('hidden');
    });

  // Initialize the camera feed once the page loads.
  setupCamera();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((granted) => {
      console.log('Persistent storage granted:', granted);
    });
  }

  openDatabase()
    .then(() => {
      loadVideosFromDB((records) => {
        // Save an array of objects with id and url.
        savedVideos = records.map((record) => ({
          id: record.id,
          url: URL.createObjectURL(record.blob),
        }));
        displaySavedVideos();
      });
    })
    .catch((err) => console.error('IndexedDB error:', err));

  // Handle file drop for video upload
  if (dropzoneFile) {
    dropzoneFile.addEventListener('change', handleFileUpload);
  }

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.match('video.*')) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const videoBlob = new Blob([e.target.result], { type: file.type });
        const videoUrl = URL.createObjectURL(videoBlob);
        savedVideos.push(videoUrl);
        saveVideoToDB(videoBlob, videoUrl); // Save the new video to IndexedDB
        displaySavedVideos();
      };
      reader.readAsArrayBuffer(file);
    }
  }

  // Handle the install prompt for Android
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
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          } else {
            console.log('User dismissed the install prompt');
          }
          deferredPrompt = null;
        });
      });
    }
  });
});
