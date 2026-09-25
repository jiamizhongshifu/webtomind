/**
 * Ported from jtydhr88/ComfyUI-qwenmultiangle (MIT License).
 * https://github.com/jtydhr88/ComfyUI-qwenmultiangle
 *
 * Adapted for WebToMind image editor:
 * - state mapped to product camera semantics: azimuth=rotate (0-360),
 *   elevation=vertical (-90..90), distance=zoom (0.6..1.4)
 * - removed ComfyUI-specific camera-view/orbit mode and prompt generation
 *   (prompt building lives in editor-tools buildCameraInstruction)
 */
import * as THREE from 'three';

export interface CameraWidgetState {
  azimuth: number;
  elevation: number;
  distance: number;
  imageUrl: string | null;
}

export interface CameraWidgetOptions {
  container: HTMLElement;
  initialState?: Partial<CameraWidgetState>;
  onStateChange?: (state: CameraWidgetState) => void;
}

const ELEVATION_MIN = -90;
const ELEVATION_MAX = 90;
const DISTANCE_MIN = 0.6;
const DISTANCE_MAX = 1.4;
const DISTANCE_DEFAULT = 1.0;

export class CameraWidget {
  private container: HTMLElement;
  private state: CameraWidgetState;
  private onStateChange?: (state: CameraWidgetState) => void;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  private cameraIndicator!: THREE.Mesh;
  private camGlow!: THREE.Mesh;
  private azimuthHandle!: THREE.Mesh;
  private azGlow!: THREE.Mesh;
  private elevationHandle!: THREE.Mesh;
  private elGlow!: THREE.Mesh;
  private distanceHandle!: THREE.Mesh;
  private distGlow!: THREE.Mesh;
  private glowRing!: THREE.Mesh;
  private imagePlane!: THREE.Mesh;
  private imageFrame!: THREE.LineSegments;
  private planeMat!: THREE.MeshBasicMaterial;
  private distanceTube: THREE.Mesh | null = null;

  private azimuthRing!: THREE.Mesh;
  private elevationArc!: THREE.Mesh;
  private gridHelper!: THREE.GridHelper;

  private readonly CENTER = new THREE.Vector3(0, 0.5, 0);
  private readonly AZIMUTH_RADIUS = 1.8;
  private readonly ELEVATION_RADIUS = 1.4;
  private readonly ELEV_ARC_X = -0.8;

  private liveAzimuth = 0;
  private liveElevation = 0;
  private liveDistance = DISTANCE_DEFAULT;

  private isDragging = false;
  private dragTarget: string | null = null;
  private hoveredHandle: { mesh: THREE.Mesh; glow: THREE.Mesh; name: string } | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private animationId: number | null = null;
  private time = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: CameraWidgetOptions) {
    this.container = options.container;
    this.onStateChange = options.onStateChange;
    this.state = {
      azimuth: options.initialState?.azimuth ?? 0,
      elevation: options.initialState?.elevation ?? 0,
      distance: options.initialState?.distance ?? DISTANCE_DEFAULT,
      imageUrl: options.initialState?.imageUrl ?? null
    };

    this.liveAzimuth = this.state.azimuth;
    this.liveElevation = this.state.elevation;
    this.liveDistance = this.state.distance;

    this.initThreeJS();
    this.bindEvents();
    if (this.state.imageUrl) this.updateImage(this.state.imageUrl);
    this.animate();
  }

  private initThreeJS(): void {
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 300;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(4, 3.5, 4);
    this.camera.lookAt(0, 0.3, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 5);
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xe93d82, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    this.gridHelper = new THREE.GridHelper(5, 20, 0x1a1a2e, 0x12121a);
    this.gridHelper.position.y = -0.01;
    this.scene.add(this.gridHelper);

    this.createSubject();
    this.createCameraIndicator();
    this.createAzimuthRing();
    this.createElevationArc();
    this.createDistanceHandle();
    this.updateVisuals();
  }

  private createGridTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    const gridSize = 16;
    for (let i = 0; i <= size; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  private createSubject(): void {
    const cardThickness = 0.02;
    const cardGeo = new THREE.BoxGeometry(1.2, 1.2, cardThickness);

    const frontMat = new THREE.MeshBasicMaterial({ color: 0x3a3a4a });
    const backMat = new THREE.MeshBasicMaterial({ map: this.createGridTexture() });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2a });

    const cardMaterials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
    this.imagePlane = new THREE.Mesh(cardGeo, cardMaterials);
    this.imagePlane.position.copy(this.CENTER);
    this.scene.add(this.imagePlane);

    this.planeMat = frontMat;

    const frameGeo = new THREE.EdgesGeometry(cardGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: 0xe93d82 });
    this.imageFrame = new THREE.LineSegments(frameGeo, frameMat);
    this.imageFrame.position.copy(this.CENTER);
    this.scene.add(this.imageFrame);

    const glowRingGeo = new THREE.RingGeometry(0.55, 0.58, 64);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xe93d82,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    this.glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    this.glowRing.position.set(0, 0.01, 0);
    this.glowRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.glowRing);
  }

  private createCameraIndicator(): void {
    const camGeo = new THREE.ConeGeometry(0.15, 0.4, 4);
    const camMat = new THREE.MeshStandardMaterial({
      color: 0xe93d82,
      emissive: 0xe93d82,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2
    });
    this.cameraIndicator = new THREE.Mesh(camGeo, camMat);
    this.scene.add(this.cameraIndicator);

    const camGlowGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const camGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff6ba8,
      transparent: true,
      opacity: 0.8
    });
    this.camGlow = new THREE.Mesh(camGlowGeo, camGlowMat);
    this.scene.add(this.camGlow);
  }

  private createAzimuthRing(): void {
    const azRingGeo = new THREE.TorusGeometry(this.AZIMUTH_RADIUS, 0.04, 16, 100);
    const azRingMat = new THREE.MeshBasicMaterial({
      color: 0xe93d82,
      transparent: true,
      opacity: 0.7
    });
    this.azimuthRing = new THREE.Mesh(azRingGeo, azRingMat);
    this.azimuthRing.rotation.x = Math.PI / 2;
    this.azimuthRing.position.y = 0.02;
    this.scene.add(this.azimuthRing);

    const azHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const azHandleMat = new THREE.MeshStandardMaterial({
      color: 0xe93d82,
      emissive: 0xe93d82,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4
    });
    this.azimuthHandle = new THREE.Mesh(azHandleGeo, azHandleMat);
    this.scene.add(this.azimuthHandle);

    const azGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const azGlowMat = new THREE.MeshBasicMaterial({
      color: 0xe93d82,
      transparent: true,
      opacity: 0.2
    });
    this.azGlow = new THREE.Mesh(azGlowGeo, azGlowMat);
    this.scene.add(this.azGlow);
  }

  private createElevationArc(): void {
    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i += 1) {
      const angle = (ELEVATION_MIN + ((ELEVATION_MAX - ELEVATION_MIN) * i) / 32) * (Math.PI / 180);
      arcPoints.push(
        new THREE.Vector3(
          this.ELEV_ARC_X,
          this.ELEVATION_RADIUS * Math.sin(angle) + this.CENTER.y,
          this.ELEVATION_RADIUS * Math.cos(angle)
        )
      );
    }
    const arcCurve = new THREE.CatmullRomCurve3(arcPoints);
    const elArcGeo = new THREE.TubeGeometry(arcCurve, 32, 0.04, 8, false);
    const elArcMat = new THREE.MeshBasicMaterial({
      color: 0x00ffd0,
      transparent: true,
      opacity: 0.8
    });
    this.elevationArc = new THREE.Mesh(elArcGeo, elArcMat);
    this.scene.add(this.elevationArc);

    const elHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const elHandleMat = new THREE.MeshStandardMaterial({
      color: 0x00ffd0,
      emissive: 0x00ffd0,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4
    });
    this.elevationHandle = new THREE.Mesh(elHandleGeo, elHandleMat);
    this.scene.add(this.elevationHandle);

    const elGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const elGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffd0,
      transparent: true,
      opacity: 0.2
    });
    this.elGlow = new THREE.Mesh(elGlowGeo, elGlowMat);
    this.scene.add(this.elGlow);
  }

  private createDistanceHandle(): void {
    const distHandleGeo = new THREE.SphereGeometry(0.15, 32, 32);
    const distHandleMat = new THREE.MeshStandardMaterial({
      color: 0xffb800,
      emissive: 0xffb800,
      emissiveIntensity: 0.7,
      metalness: 0.5,
      roughness: 0.3
    });
    this.distanceHandle = new THREE.Mesh(distHandleGeo, distHandleMat);
    this.scene.add(this.distanceHandle);

    const distGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const distGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffb800,
      transparent: true,
      opacity: 0.25
    });
    this.distGlow = new THREE.Mesh(distGlowGeo, distGlowMat);
    this.scene.add(this.distGlow);
  }

  private updateDistanceLine(start: THREE.Vector3, end: THREE.Vector3): void {
    if (this.distanceTube) {
      this.scene.remove(this.distanceTube);
      this.distanceTube.geometry.dispose();
      (this.distanceTube.material as THREE.Material).dispose();
    }
    const path = new THREE.LineCurve3(start, end);
    const tubeGeo = new THREE.TubeGeometry(path, 1, 0.025, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0xffb800,
      transparent: true,
      opacity: 0.8
    });
    this.distanceTube = new THREE.Mesh(tubeGeo, tubeMat);
    this.scene.add(this.distanceTube);
  }

  private updateVisuals(): void {
    const azRad = (this.liveAzimuth * Math.PI) / 180;
    const elRad = (this.liveElevation * Math.PI) / 180;
    // zoom 0.6（近）→ 2.6 视距；zoom 1.4（远）→ 0.6 视距
    const visualDist = 2.6 - ((this.liveDistance - DISTANCE_MIN) / (DISTANCE_MAX - DISTANCE_MIN)) * 2.0;

    const camX = visualDist * Math.sin(azRad) * Math.cos(elRad);
    const camY = this.CENTER.y + visualDist * Math.sin(elRad);
    const camZ = visualDist * Math.cos(azRad) * Math.cos(elRad);

    this.cameraIndicator.position.set(camX, camY, camZ);
    this.cameraIndicator.lookAt(this.CENTER);
    this.cameraIndicator.rotateX(Math.PI / 2);
    this.camGlow.position.copy(this.cameraIndicator.position);

    const azX = this.AZIMUTH_RADIUS * Math.sin(azRad);
    const azZ = this.AZIMUTH_RADIUS * Math.cos(azRad);
    this.azimuthHandle.position.set(azX, 0.16, azZ);
    this.azGlow.position.copy(this.azimuthHandle.position);

    const elY = this.CENTER.y + this.ELEVATION_RADIUS * Math.sin(elRad);
    const elZ = this.ELEVATION_RADIUS * Math.cos(elRad);
    this.elevationHandle.position.set(this.ELEV_ARC_X, elY, elZ);
    this.elGlow.position.copy(this.elevationHandle.position);

    const distT = 0.15 + ((DISTANCE_MAX - this.liveDistance) / (DISTANCE_MAX - DISTANCE_MIN)) * 0.7;
    this.distanceHandle.position.lerpVectors(this.CENTER, this.cameraIndicator.position, distT);
    this.distGlow.position.copy(this.distanceHandle.position);

    this.updateDistanceLine(this.CENTER.clone(), this.cameraIndicator.position.clone());
    this.glowRing.rotation.z += 0.005;
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', this.onPointerDown.bind(this));
    canvas.addEventListener('mousemove', this.onPointerMove.bind(this));
    canvas.addEventListener('mouseup', this.onPointerUp.bind(this));
    canvas.addEventListener('mouseleave', this.onPointerUp.bind(this));

    canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.onPointerDown({
          clientX: e.touches[0].clientX,
          clientY: e.touches[0].clientY
        } as MouseEvent);
      },
      { passive: false }
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        this.onPointerMove({
          clientX: e.touches[0].clientX,
          clientY: e.touches[0].clientY
        } as MouseEvent);
      },
      { passive: false }
    );

    canvas.addEventListener('touchend', () => this.onPointerUp());

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
  }

  private getMousePos(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private setHandleScale(handle: THREE.Mesh, glow: THREE.Mesh | null, scale: number): void {
    handle.scale.setScalar(scale);
    if (glow) glow.scale.setScalar(scale);
  }

  private onPointerDown(event: MouseEvent): void {
    this.getMousePos(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const handles = [
      { mesh: this.azimuthHandle, glow: this.azGlow, name: 'azimuth' },
      { mesh: this.elevationHandle, glow: this.elGlow, name: 'elevation' },
      { mesh: this.distanceHandle, glow: this.distGlow, name: 'distance' }
    ];

    for (const h of handles) {
      if (this.raycaster.intersectObject(h.mesh).length > 0) {
        this.isDragging = true;
        this.dragTarget = h.name;
        this.setHandleScale(h.mesh, h.glow, 1.3);
        this.renderer.domElement.style.cursor = 'grabbing';
        return;
      }
    }
  }

  private onPointerMove(event: MouseEvent): void {
    this.getMousePos(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (!this.isDragging) {
      const handles = [
        { mesh: this.azimuthHandle, glow: this.azGlow, name: 'azimuth' },
        { mesh: this.elevationHandle, glow: this.elGlow, name: 'elevation' },
        { mesh: this.distanceHandle, glow: this.distGlow, name: 'distance' }
      ];

      let foundHover: (typeof handles)[0] | null = null;
      for (const h of handles) {
        if (this.raycaster.intersectObject(h.mesh).length > 0) {
          foundHover = h;
          break;
        }
      }

      if (this.hoveredHandle && this.hoveredHandle !== foundHover) {
        this.setHandleScale(this.hoveredHandle.mesh, this.hoveredHandle.glow, 1.0);
      }

      if (foundHover) {
        this.setHandleScale(foundHover.mesh, foundHover.glow, 1.15);
        this.renderer.domElement.style.cursor = 'grab';
        this.hoveredHandle = foundHover;
      } else {
        this.renderer.domElement.style.cursor = 'default';
        this.hoveredHandle = null;
      }
      return;
    }

    const plane = new THREE.Plane();
    const intersect = new THREE.Vector3();

    if (this.dragTarget === 'azimuth') {
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
      if (this.raycaster.ray.intersectPlane(plane, intersect)) {
        let angle = Math.atan2(intersect.x, intersect.z) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        this.liveAzimuth = Math.max(0, Math.min(360, angle));
        this.state.azimuth = Math.round(this.liveAzimuth);
        this.updateVisuals();
        this.notifyStateChange();
      }
    } else if (this.dragTarget === 'elevation') {
      const elevPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -this.ELEV_ARC_X);
      if (this.raycaster.ray.intersectPlane(elevPlane, intersect)) {
        const relY = intersect.y - this.CENTER.y;
        const relZ = intersect.z;
        let angle = Math.atan2(relY, relZ) * (180 / Math.PI);
        angle = Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, angle));
        this.liveElevation = angle;
        this.state.elevation = Math.round(this.liveElevation);
        this.updateVisuals();
        this.notifyStateChange();
      }
    } else if (this.dragTarget === 'distance') {
      const newDist = DISTANCE_DEFAULT - this.mouse.y * 0.4;
      this.liveDistance = Math.max(DISTANCE_MIN, Math.min(DISTANCE_MAX, newDist));
      this.state.distance = Math.round(this.liveDistance * 100) / 100;
      this.updateVisuals();
      this.notifyStateChange();
    }
  }

  private onPointerUp(): void {
    if (this.isDragging) {
      const handles = [
        { mesh: this.azimuthHandle, glow: this.azGlow },
        { mesh: this.elevationHandle, glow: this.elGlow },
        { mesh: this.distanceHandle, glow: this.distGlow }
      ];
      handles.forEach((h) => this.setHandleScale(h.mesh, h.glow, 1.0));
    }

    this.isDragging = false;
    this.dragTarget = null;
    this.renderer.domElement.style.cursor = 'default';
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    this.time += 0.01;
    const pulse = 1 + Math.sin(this.time * 2) * 0.03;
    this.camGlow.scale.setScalar(pulse);
    this.glowRing.rotation.z += 0.003;

    this.renderer.render(this.scene, this.camera);
  }

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }

  public setState(newState: Partial<CameraWidgetState>): void {
    if (newState.azimuth !== undefined) {
      this.state.azimuth = newState.azimuth;
      this.liveAzimuth = newState.azimuth;
    }
    if (newState.elevation !== undefined) {
      this.state.elevation = newState.elevation;
      this.liveElevation = newState.elevation;
    }
    if (newState.distance !== undefined) {
      this.state.distance = newState.distance;
      this.liveDistance = newState.distance;
    }
    if (newState.imageUrl !== undefined) {
      this.state.imageUrl = newState.imageUrl;
      this.updateImage(newState.imageUrl);
    }
    this.updateVisuals();
  }

  public getState(): CameraWidgetState {
    return { ...this.state };
  }

  public resetToDefaults(): void {
    this.state.azimuth = 0;
    this.state.elevation = 0;
    this.state.distance = DISTANCE_DEFAULT;
    this.liveAzimuth = 0;
    this.liveElevation = 0;
    this.liveDistance = DISTANCE_DEFAULT;
    this.updateVisuals();
    this.notifyStateChange();
  }

  public updateImage(url: string | null): void {
    if (url) {
      const img = new Image();
      if (!url.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        this.planeMat.map = tex;
        this.planeMat.color.set(0xffffff);
        this.planeMat.needsUpdate = true;

        const ar = img.width / img.height;
        const maxSize = 1.5;
        let scaleX: number;
        let scaleY: number;
        if (ar > 1) {
          scaleX = maxSize;
          scaleY = maxSize / ar;
        } else {
          scaleY = maxSize;
          scaleX = maxSize * ar;
        }
        this.imagePlane.scale.set(scaleX, scaleY, 1);
        this.imageFrame.scale.set(scaleX, scaleY, 1);
      };

      img.onerror = () => {
        this.planeMat.map = null;
        this.planeMat.color.set(0xe93d82);
        this.planeMat.needsUpdate = true;
      };

      img.src = url;
    } else {
      this.planeMat.map = null;
      this.planeMat.color.set(0x3a3a4a);
      this.planeMat.needsUpdate = true;
      this.imagePlane.scale.set(1, 1, 1);
      this.imageFrame.scale.set(1, 1, 1);
    }
  }

  public dispose(): void {
    if (this.animationId !== null) {
      try {
        window.cancelAnimationFrame(this.animationId);
      } catch {
        // ignore
      }
      this.animationId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    try {
      this.renderer.dispose();
    } catch {
      // ignore
    }

    try {
      this.scene.clear();
    } catch {
      // ignore
    }

    try {
      if (this.renderer.domElement.parentElement === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    } catch {
      // ignore
    }
  }
}
