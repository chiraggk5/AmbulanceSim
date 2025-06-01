// js/Config.js
export const Config = {
    debug: true, // Set to false for production

    // Scene
    backgroundColor: 0xaaaaaa,
    roadSurfaceY: 0.05,
    cameraPosition: { x: 50, y: 60, z: 50 },
    useCinematicCamera: true,   // SET TO true TO ENABLE CINEMATIC CAMERA
    fogEnable: true,
    fogColor: 0x87CEEB,
    fogNear: 70,
    fogFar: 350,

    // --- Cinematic Camera Settings (SIMPLIFIED FOR THIRD-PERSON FOLLOW) ---
    cameraFollowOffset: { x: 0, y: 9, z: -5 },  // Closer and slightly more above: Y higher, Z less negative
    cameraLookAtOffsetAmbulance: { x: 0, y: 1.3, z: 5 },// Look at mid-height of amb, a bit ahead
    cameraLerpFactor: 0.06,  

    // Road layout
    roadWidth: 8,
    roadLength: 70,
    junctionSize: 12,
    numJunctions: 3,
    footpathWidth: 2.0,
    footpathHeightOffset: 0.05, // How much footpath surface is above roadSurfaceY

    // Building Placement (New/Adjusted)
    cityBlocksX: 6,               // Number of "blocks" along X axis for city generation
    cityBlocksZ: 5,               // Number of "blocks" along Z axis
    blockSpacing: 45,             // Spacing between block centers (reduced for density)
    buildingsPerBlockAttempt: 6,  // How many times to try placing a building in a block
    maxBuildingsPerBlock: 1,      // Max successful building placements per block
    buildingSpreadFactor: 0.45,   // How much buildings spread within a block (lower = denser, e.g., 0.6 means they use 60% of space)

    // Ambulance
    ambulanceSpeed: 0.25,
    ambulanceFadeOutDuration: 2.0, // Added for Ambulance.js
    sirenDetectionRadius: 60,   // Increased: How far a reflector can 'hear' the siren
    ambulancePreemptionRadius: 150, // New: Distance from junction center to start preempting traffic lights
    ambulanceModelFile: 'assets/models/ambulance.glb',
    sirenAudioFile: 'assets/audio/ambulance_siren.mp3',
    ambulanceLaneOffsetZ: -1.75, // z-offset for ambulance path from center of the road
    ambulanceScaleFactor: 0.05, // Example scale for your GLB model
    ambulanceModelYAdjust: 4.85, // Fine-tune Y offset for ambulance model base after scaling (original value was 4.85, check if this is better)

    // Traffic Light
    trafficLightGreenDuration: 8000,
    trafficLightYellowDuration: 2000,
    trafficLightRedDuration: 10000, // Not directly used in cycle, but for reference
    trafficLightSize: { width: 0.5, height: 1.5, depth: 0.3 },
    lightRadius: 0.15,

    // Smart Reflector
    reflectorSpacing: 6,
    reflectorDetectionChainRadius: 4.0, // For one reflector to detect another if ambulance is between them
    reflectorSignalDuration: 1500,

    // Procedural Cars
    numberOfCars: 10,
    minCarSpeed: 0.06,
    maxCarSpeed: 0.18,
    laneWidth: 3.5, // Assumed width of a single lane for car positioning
    carEvadeDistance: 25, // Distance at which cars start evading ambulance
    carEvadeShiftZ: 2.5, // How much cars shift sideways to evade
    carStopDistanceToJunction: 8, // How far before junction cars stop for red/yellow
    carDetectionDistanceToJunction: 25, // How far cars look ahead for traffic lights

    // Procedural Pedestrians
    numberOfPedestrians: 15,

    // Colors
    colors: {
        road: 0x444444,
        pole: 0x555555, // For traffic light poles
        trafficLightHousing: 0x333333, // For traffic light housings
        redLightOn: 0xff0000,
        redLightOff: 0x440000,
        yellowLightOn: 0xffff00,
        yellowLightOff: 0x444400,
        greenLightOn: 0x00ff00,
        greenLightOff: 0x004400,
        reflector: 0xAAAAAA, // Color of reflector LEDs when 'off' or standby
        reflectorEmissiveOff: 0x111100, // Emissive color for reflector LEDs when 'off'
        reflectorSignal: 0x00ffff, // Color of reflector LEDs when signaling (e.g., cyan)
        solarPanel: 0x0000AA, // Color for the solar panel on smart reflectors
        microphone: 0xCCCCCC // Color for the microphone component on smart reflectors
    }
};