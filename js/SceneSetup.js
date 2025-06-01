// js/SceneSetup.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Config } from './Config.js';

export class SceneSetup {
    constructor(containerId = null) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(Config.fogEnable ? Config.fogColor : Config.backgroundColor);
        this.textureLoader = new THREE.TextureLoader();

        const safeRoadSurfaceY = Config.roadSurfaceY ?? 0;

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(
            Config.cameraPosition?.x || 40,
            Config.cameraPosition?.y || 60,
            Config.cameraPosition?.z || 50
        );
        this.camera.lookAt(0, safeRoadSurfaceY, 0); // Look at road level initially

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

        const container = containerId ? document.getElementById(containerId) : document.body;
        container.appendChild(this.renderer.domElement);
        

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Softer ambient light
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Stronger directional
        directionalLight.position.set(70, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048; // Good shadow quality
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 250; // Adjust to scene extent
        directionalLight.shadow.camera.left = -120; // Adjust to scene extent
        directionalLight.shadow.camera.right = 120;
        directionalLight.shadow.camera.top = 120;
        directionalLight.shadow.camera.bottom = -120;
        this.scene.add(directionalLight);
        
        // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera); // For debugging shadow camera
        // this.scene.add(shadowHelper);

        if (Config.fogEnable) {
            this.scene.fog = new THREE.Fog(Config.fogColor, Config.fogNear, Config.fogFar);
        }


        // Ground Surface
        this.createGroundPlane(safeRoadSurfaceY);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2.05; // Prevent looking too far underneath
        this.controls.target.set(0, safeRoadSurfaceY, 0); // Orbit around road level
        this.controls.enabled = !Config.useCinematicCamera; // Disable if cinematic cam is default

        // Grid Helper (optional, for development)
        if (Config.debug) {
            const gridHelper = new THREE.GridHelper(500, 50, 0x888888, 0x666666);
            gridHelper.position.y = safeRoadSurfaceY - 0.12; // Slightly below main ground plane
            this.scene.add(gridHelper);
            const axesHelper = new THREE.AxesHelper(25);
            axesHelper.position.y = safeRoadSurfaceY; // At road level for reference
            this.scene.add(axesHelper);
        }

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    createGroundPlane(roadSurfaceY) {
        const groundSize = (Config.fogFar || 250) * 2.5; // Ground extends well into fog
        const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
        
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x609040, // A muted green
            roughness: 0.95,
            metalness: 0.05,
        });

        try {
            const groundTexturePath = 'assets/textures/grass_01.jpg'; // Ensure path is correct
            const groundTexture = this.textureLoader.load(groundTexturePath,
                (tex) => { // onLoad
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                    tex.repeat.set(groundSize / 15, groundSize / 15); // Adjust tiling
                    if(this.renderer && this.renderer.capabilities) { // For Anisotropy
                        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                    }
                    groundMaterial.map = tex;
                    groundMaterial.color.set(0xffffff); // Use texture's full color
                    groundMaterial.needsUpdate = true;
                },
                undefined, // onProgress
                (err) => { // onError
                    console.warn(`Ground texture '${groundTexturePath}' not found or failed to load. Using plain color.`, err);
                }
            );
        } catch (e) { console.warn("Error initiating ground texture load.", e); }

        const groundPlane = new THREE.Mesh(groundGeo, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2; // Horizontal
        groundPlane.position.y = roadSurfaceY - 0.15; // Position it slightly below roads
        groundPlane.receiveShadow = true; // Ground receives shadows from objects
        this.scene.add(groundPlane);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        if (this.controls.enabled) this.controls.update(); // Update controls if enabled
        this.renderer.render(this.scene, this.camera);
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }
}