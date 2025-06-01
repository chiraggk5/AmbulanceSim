// js/TrafficLight.js
import * as THREE from 'three';
import { Config } from './Config.js';

const LIGHT_STATE = { RED: 'RED', YELLOW: 'YELLOW', GREEN: 'GREEN', OFF: 'OFF' };

export class TrafficLight {
    constructor(position, rotationY = 0) {
        this.group = new THREE.Group();
        this.group.position.copy(position); // Position is base of the pole on footpath
        this.group.rotation.y = rotationY;
        this.id = `TrafficLight-${Math.random().toString(36).substr(2, 5)}`;

        // Pole: group origin is at base of pole. Pole extends upwards.
        const poleHeight = 3;
        const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, poleHeight, 12);
        const poleMat = new THREE.MeshStandardMaterial({ color: Config.colors?.pole || 0x555555 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = poleHeight / 2; // Center the pole mesh relative to its base
        pole.castShadow = true;
        this.group.add(pole);

        // Housing for lights
        const housingSize = Config.trafficLightSize || { width: 0.5, height: 1.5, depth: 0.3 };
        const housingGeo = new THREE.BoxGeometry(housingSize.width, housingSize.height, housingSize.depth);
        const housingMat = new THREE.MeshStandardMaterial({ color: Config.colors?.trafficLightHousing || 0x333333 });
        const housing = new THREE.Mesh(housingGeo, housingMat);
        // Position housing towards top of pole, slightly forward
        housing.position.y = poleHeight - housingSize.height / 2 + 0.2; // Adjust so base of housing is near pole top
        housing.position.z = housingSize.depth / 2 + 0.15; // Offset housing forward from pole center
        housing.castShadow = true;
        this.group.add(housing);

        // Light positions within the housing (Y is relative to housing center)
        const lightRadius = Config.lightRadius || 0.15;
        const lightYPositions = [
            housingSize.height / 2 - lightRadius - 0.1, // Top (Red)
            0,                                          // Middle (Yellow)
            -housingSize.height / 2 + lightRadius + 0.1 // Bottom (Green)
        ];
        
        // Lights are on the front face of the housing
        const lightZPosInHousing = housingSize.depth / 2 + 0.01; // Slightly proud of housing face

        // Default colors from Config or hardcoded fallbacks
        const defaultRedOff = 0x440000, defaultRedOn = 0xff0000;
        const defaultYellowOff = 0x444400, defaultYellowOn = 0xffff00;
        const defaultGreenOff = 0x004400, defaultGreenOn = 0x00ff00;

        this.lights = {
            red: this.createLight(Config.colors?.redLightOff || defaultRedOff, lightYPositions[0], lightZPosInHousing, lightRadius),
            yellow: this.createLight(Config.colors?.yellowLightOff || defaultYellowOff, lightYPositions[1], lightZPosInHousing, lightRadius),
            green: this.createLight(Config.colors?.greenLightOff || defaultGreenOff, lightYPositions[2], lightZPosInHousing, lightRadius)
        };

        housing.add(this.lights.red);
        housing.add(this.lights.yellow);
        housing.add(this.lights.green);

        this.currentState = LIGHT_STATE.RED; // Default initial state
        this.isOverridden = false; // For ambulance priority
        this.setLightState(LIGHT_STATE.RED, false, true); // Initialize lights silently
    }

    createLight(color, yPos, zPos, radius) {
        const lightGeo = new THREE.SphereGeometry(radius, 16, 16);
        const lightMat = new THREE.MeshStandardMaterial({
            color: color, 
            emissive: color, // Emissive color same as base for "off" state, will be intensified for "on"
            emissiveIntensity: 0.2 // Dimly emissive when "off"
        });
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(0, yPos, zPos); // Position relative to housing center
        return light;
    }

    setLightState(state, isPriorityOverride = false, forceSilent = false) {
        if (!isPriorityOverride && this.isOverridden) {
            // If overridden by priority, normal state changes are blocked
            if (!forceSilent) console.log(`[${this.id}] State change to ${state} blocked by override.`);
            return;
        }
        if (!forceSilent) console.log(`[${this.id}] Setting state to: ${state}${isPriorityOverride ? ' (Priority)' : ''}`);

        this.currentState = state;

        // Define default colors (repeated for clarity within this function scope)
        const defaultRedOff = 0x440000, defaultRedOn = 0xff0000;
        const defaultYellowOff = 0x444400, defaultYellowOn = 0xffff00;
        const defaultGreenOff = 0x004400, defaultGreenOn = 0x00ff00;

        // Get colors from config or use defaults
        const redOffColor = Config.colors?.redLightOff || defaultRedOff;
        const yellowOffColor = Config.colors?.yellowLightOff || defaultYellowOff;
        const greenOffColor = Config.colors?.greenLightOff || defaultGreenOff;

        const redOnColor = Config.colors?.redLightOn || defaultRedOn;
        const yellowOnColor = Config.colors?.yellowLightOn || defaultYellowOn;
        const greenOnColor = Config.colors?.greenLightOn || defaultGreenOn;

        const offIntensity = 0.2;
        const onIntensity = 1.0;

        // Reset all lights to "off" appearance first
        this.lights.red.material.color.set(redOffColor);
        this.lights.red.material.emissive.set(redOffColor);
        this.lights.red.material.emissiveIntensity = offIntensity;

        this.lights.yellow.material.color.set(yellowOffColor);
        this.lights.yellow.material.emissive.set(yellowOffColor);
        this.lights.yellow.material.emissiveIntensity = offIntensity;

        this.lights.green.material.color.set(greenOffColor);
        this.lights.green.material.emissive.set(greenOffColor);
        this.lights.green.material.emissiveIntensity = offIntensity;

        // Set the active light to "on" appearance
        switch (state) {
            case LIGHT_STATE.RED:
                this.lights.red.material.color.set(redOnColor);
                this.lights.red.material.emissive.set(redOnColor);
                this.lights.red.material.emissiveIntensity = onIntensity;
                break;
            case LIGHT_STATE.YELLOW:
                this.lights.yellow.material.color.set(yellowOnColor);
                this.lights.yellow.material.emissive.set(yellowOnColor);
                this.lights.yellow.material.emissiveIntensity = onIntensity;
                break;
            case LIGHT_STATE.GREEN:
                this.lights.green.material.color.set(greenOnColor);
                this.lights.green.material.emissive.set(greenOnColor);
                this.lights.green.material.emissiveIntensity = onIntensity;
                break;
            case LIGHT_STATE.OFF:
                // All lights remain in their "off" state (already set above)
                break;
        }
    }

    setPriority(makeGreen) { // Called by main simulation for ambulance
        this.isOverridden = true;
        if (makeGreen) {
            this.setLightState(LIGHT_STATE.GREEN, true); // True for isPriorityOverride
        } else {
            this.setLightState(LIGHT_STATE.RED, true); // Conflicting lights go red during priority
        }
    }

    releasePriority() { // Called by main simulation when ambulance passes
        this.isOverridden = false;
        // Junction controller (main.js) will decide the next state based on its cycle.
        // For safety, could set to RED, but main.js applyJunctionPhaseState should handle it.
        // this.setLightState(LIGHT_STATE.RED, false, true); // Silently set to RED as a safe default
    }

    static get LIGHT_STATE() { // Allows access like TrafficLight.LIGHT_STATE.RED
        return LIGHT_STATE;
    }
}