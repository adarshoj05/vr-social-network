(function () {
  if (typeof THREE === 'undefined') {
    var p = document.querySelector('#overlay p');
    if (p) p.textContent = 'three.js failed to load. Check your connection or whether the CDN is blocked, then reload.';
    return;
  }
  var sensorEl = document.getElementById('sensorStatus');
  function sensorProbe(e) {
    if (!sensorEl) return;
    if (e.alpha === null && e.beta === null && e.gamma === null) {
      sensorEl.textContent = 'Gyro check: events firing but values are null (no usable sensor, or access blocked).';
    } else {
      sensorEl.textContent = 'Gyro check: OK (a=' + Math.round(e.alpha) + ' b=' + Math.round(e.beta) + ' g=' + Math.round(e.gamma) + ')';
    }
  }
  window.addEventListener('deviceorientation', sensorProbe);
  setTimeout(function () {
    if (sensorEl && /waiting/.test(sensorEl.textContent)) {
      sensorEl.textContent = 'Gyro check: no sensor events received. Likely blocked (embedded frame / browser setting) or not supported.';
    }
  }, 2500);
  var started = false;
  var scene, camera, renderer, stereo;

  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

    stereo = new THREE.StereoCamera();
    stereo.aspect = 0.5;
    stereo.eyeSep = 0.063;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.1));
    var dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(2, 4, 3);
    scene.add(dir);

    var grid = new THREE.GridHelper(40, 40, 0x335577, 0x1a2233);
    grid.position.y = -0.1;
    scene.add(grid);

    var colors = [0xff5577, 0x55ff99, 0x5599ff, 0xffcc44, 0xcc77ff];
    for (var i = 0; i < 5; i++) {
      var geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      var mat = new THREE.MeshStandardMaterial({ color: colors[i] });
      var box = new THREE.Mesh(geo, mat);
      var angle = (i / 5) * Math.PI * 2;
      var radius = 2.5 + i * 1.2;
      box.position.set(Math.sin(angle) * radius, 0.3, -Math.cos(angle) * radius);
      scene.add(box);
    }

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setScissorTest(true);
    document.body.appendChild(renderer.domElement);
    onResize();
  }

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---- device orientation -> camera quaternion ----
  var zee = new THREE.Vector3(0, 0, 1);
  var euler = new THREE.Euler();
  var q0 = new THREE.Quaternion();
  var q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  var screenOrientation = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
  var deviceQuaternion = new THREE.Quaternion();
  var haveOrientation = false;

  window.addEventListener('orientationchange', function () {
    screenOrientation = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
  });

  function onDeviceOrientation(e) {
    if (e.alpha === null) return;
    haveOrientation = true;
    euler.set(
      THREE.MathUtils.degToRad(e.beta),
      THREE.MathUtils.degToRad(e.alpha),
      THREE.MathUtils.degToRad(-e.gamma),
      'YXZ'
    );
    deviceQuaternion.setFromEuler(euler);
    deviceQuaternion.multiply(q1);
    deviceQuaternion.multiply(q0.setFromAxisAngle(zee, -THREE.MathUtils.degToRad((screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0))));
    camera.quaternion.copy(deviceQuaternion);
  }

  // fallback drag-to-look for desktop testing (no gyro)
  var dragging = false, lastX = 0, lastY = 0, yaw = 0, pitch = 0;
  function enableDragFallback() {
    renderer.domElement.addEventListener('pointerdown', function (e) {
      if (haveOrientation) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging || haveOrientation) return;
      yaw -= (e.clientX - lastX) * 0.005;
      pitch -= (e.clientY - lastY) * 0.005;
      pitch = Math.max(-1.3, Math.min(1.3, pitch));
      lastX = e.clientX; lastY = e.clientY;
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    });
    window.addEventListener('pointerup', function () { dragging = false; });
  }

  function animate() {
    requestAnimationFrame(animate);
    camera.updateMatrixWorld();
    stereo.update(camera);
    var w = window.innerWidth, h = window.innerHeight;

    renderer.setViewport(0, 0, w / 2, h);
    renderer.setScissor(0, 0, w / 2, h);
    renderer.render(scene, stereo.cameraL);

    renderer.setViewport(w / 2, 0, w / 2, h);
    renderer.setScissor(w / 2, 0, w / 2, h);
    renderer.render(scene, stereo.cameraR);
  }

  function requestFS() {
    var el = document.documentElement;
    try {
      var p = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
      var lockLandscape = function () {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(function () {});
        }
      };
      if (p && p.then) { p.then(lockLandscape).catch(function () {}); }
      else { lockLandscape(); }
    } catch (err) {}
  }

  function start() {
    if (started) return;
    started = true;
    initScene();
    enableDragFallback();
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('exitBtn').style.display = 'block';
    requestFS();

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (state) {
        if (state === 'granted') window.addEventListener('deviceorientation', onDeviceOrientation);
      }).catch(function () {});
    } else {
      window.addEventListener('deviceorientation', onDeviceOrientation);
    }

    window.addEventListener('resize', onResize);
    animate();
  }

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('exitBtn').addEventListener('click', function () {
    if (document.exitFullscreen) document.exitFullscreen();
    location.reload();
  });

  var ipdInput = document.getElementById('ipd');
  var ipdVal = document.getElementById('ipdVal');
  ipdInput.addEventListener('input', function () {
    ipdVal.textContent = ipdInput.value + 'mm';
    if (stereo) stereo.eyeSep = ipdInput.value / 1000;
  });
})();