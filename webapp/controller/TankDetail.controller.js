sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/vk/ContentResource",
    "sap/ui/vk/ContentConnector",
    "sap/ui/vk/ViewStateManager",
    "sap/ui/vk/DrawerToolbar",
    "sap/ui/vk/tools/RotateOrbitTool",
    "sap/ui/vk/tools/SceneOrientationTool",
    "sap/ui/vk/ZoomTo",
    "sap/ui/vk/thirdparty/three",
    "sap/m/MessageToast"
], function (
    Controller,
    Fragment,
    JSONModel,
    Filter,
    FilterOperator,
    ContentResource,
    ContentConnector,
    ViewStateManager,
    DrawerToolbar,
    RotateOrbitTool,
    SceneOrientationTool,
    ZoomTo,
    THREE,
    MessageToast
) {
    "use strict";

    var TANK_MODEL_SOURCE_TYPE = "TANK.MODEL";
    var TANK_MODEL_SOURCE = "tank://procedural";
    var TANK_FILL_FLOOR_OFFSET = 0.7;
    var TANK_WIRE_CAGE_VERTICALS = 32;
    var TANK_WIRE_CAGE_RINGS = 13;
    var TANK_WIRE_CAGE_BUILD_MS = 1600;
    var TANK_SHELL_PEEL_DURATION_MS = 1100;
    var TANK_ASSEMBLY_MAX_PHASE = 9;
    var TANK_ASSEMBLY_LIQUID_PHASE = 9;
    var TANK_ASSEMBLY_LIQUID_CHARGE_MS = 1200;
    var TANK_ASSEMBLY_PHASE_DURATION_MS = 520;
    var TANK_ASSEMBLY_PHASE_GAP_MS = 140;
    var TANK_ASSEMBLY_STEPS = [
        { phase: 0, parts: [{ name: "Foundation", style: "drop" }] },
        { phase: 1, parts: [{ name: "BasePlate", style: "drop" }], revealDecor: true },
        { phase: 2, parts: [{ name: "TankWireCage", style: "wire-cage-build" }] },
        { phase: 3, parts: [{ name: "TankShell", style: "drop" }] },
        { phase: 4, parts: [{ name: "WindGirder", style: "pop" }], revealDecor: true },
        { phase: 5, parts: [{ name: "RoofDeck", style: "drop" }, { name: "ConicalRoof", style: "pop" }], revealDecor: true },
        { phase: 6, parts: [
            { name: "VentPipe", style: "drop" },
            { name: "VentCage", style: "pop" },
            { name: "DipHatch", style: "pop" },
            { name: "RoofManhole", style: "pop" },
            { name: "FillPipe", style: "drop" }
        ], revealDecor: true },
        { phase: 7, parts: [
            { name: "CagedAccessLadder", style: "slide" },
            { name: "SideServicePipe", style: "slide" },
            { name: "BoardLevelGauge", style: "slide" }
        ] },
        { phase: 8, parts: [
            { name: "ShellManhole", style: "pop" },
            { name: "ManholeDavit", style: "pop" },
            { name: "DrawOffCleanOut", style: "pop" }
        ] }
    ];
    var TANK_ASSEMBLY_MAJOR_NAMES = {};
    TANK_ASSEMBLY_STEPS.forEach(function (oStep) {
        oStep.parts.forEach(function (oPart) {
            TANK_ASSEMBLY_MAJOR_NAMES[oPart.name] = true;
        });
    });
    var bTankModelResolverRegistered = false;
    var oTankSceneConfigStore = {};
    var TANK_INTERACT_PARTS = {
        TankWireCage: true,
        TankShell: true,
        ConicalRoof: true,
        RoofDeck: true,
        InventoryFill: true,
        WindGirder: true,
        Foundation: true
    };

    var STATUS_MAP = {
        E: {
            text: "빈 탱크",
            state: "None",
            icon: "sap-icon://circle-task-2",
            color: "#B8BDC3",
            levelState: "None"
        },
        A: {
            text: "가용재고",
            state: "Success",
            icon: "sap-icon://status-positive",
            color: "#2E7D32",
            levelState: "Success"
        },
        P: {
            text: "품질검사대기",
            state: "Warning",
            icon: "sap-icon://inspect",
            color: "#EF6C00",
            levelState: "Warning"
        },
        I: {
            text: "입고 중",
            state: "Information",
            icon: "sap-icon://shipping-status",
            color: "#1976D2",
            levelState: "Information"
        },
        F: {
            text: "품질 검사 실패",
            state: "Error",
            icon: "sap-icon://status-error",
            color: "#D32F2F",
            levelState: "Error"
        },
        R: {
            text: "예약탱크(입고예정)",
            state: "None",
            icon: "sap-icon://appointment",
            color: "#6A1B9A",
            levelState: "None"
        }
    };

    function hexToNumber(sHex) {
        return parseInt(String(sHex || "#8A9299").replace("#", ""), 16);
    }

    function createGalvanizedSteelTextures(THREE) {
        var iSize = 1024;
        var oColorCanvas = document.createElement("canvas");
        var oBumpCanvas = document.createElement("canvas");
        var oRoughCanvas = document.createElement("canvas");

        oColorCanvas.width = oBumpCanvas.width = oRoughCanvas.width = iSize;
        oColorCanvas.height = oBumpCanvas.height = oRoughCanvas.height = iSize;

        var oColorCtx = oColorCanvas.getContext("2d");
        var oBumpCtx = oBumpCanvas.getContext("2d");
        var oRoughCtx = oRoughCanvas.getContext("2d");
        var iHPlate = 68;
        var iVPlate = 52;
        var n;

        oColorCtx.fillStyle = "#7a828a";
        oColorCtx.fillRect(0, 0, iSize, iSize);
        oBumpCtx.fillStyle = "#7a7a7a";
        oBumpCtx.fillRect(0, 0, iSize, iSize);
        oRoughCtx.fillStyle = "#8e8e8e";
        oRoughCtx.fillRect(0, 0, iSize, iSize);

        for (n = 0; n < 22000; n++) {
            var fX = Math.random() * iSize;
            var fY = Math.random() * iSize;
            var iGray = 138 + Math.floor(Math.random() * 55);
            oColorCtx.fillStyle = "rgba(" + iGray + "," + (iGray + 2) + "," + (iGray + 5) + "," + (0.08 + Math.random() * 0.18) + ")";
            oColorCtx.fillRect(fX, fY, 1 + Math.random() * 4, 1 + Math.random() * 4);
        }

        for (n = 0; n < 180; n++) {
            var fSpotX = Math.random() * iSize;
            var fSpotY = Math.random() * iSize;
            var fSpotR = 6 + Math.random() * 22;
            var gSpot = oColorCtx.createRadialGradient(fSpotX, fSpotY, 0, fSpotX, fSpotY, fSpotR);
            gSpot.addColorStop(0, "rgba(196,202,208,0.18)");
            gSpot.addColorStop(1, "rgba(160,168,174,0)");
            oColorCtx.fillStyle = gSpot;
            oColorCtx.beginPath();
            oColorCtx.arc(fSpotX, fSpotY, fSpotR, 0, Math.PI * 2);
            oColorCtx.fill();
        }

        for (n = 0; n < 90; n++) {
            var fStainX = Math.random() * iSize;
            var fStainY = Math.random() * iSize;
            var fStainR = 18 + Math.random() * 55;
            var gStain = oColorCtx.createRadialGradient(fStainX, fStainY, 0, fStainX, fStainY, fStainR);
            gStain.addColorStop(0, "rgba(72,78,84,0.14)");
            gStain.addColorStop(1, "rgba(120,126,132,0)");
            oColorCtx.fillStyle = gStain;
            oColorCtx.beginPath();
            oColorCtx.arc(fStainX, fStainY, fStainR, 0, Math.PI * 2);
            oColorCtx.fill();
            oRoughCtx.fillStyle = "rgba(50,54,58," + (0.12 + Math.random() * 0.2) + ")";
            oRoughCtx.beginPath();
            oRoughCtx.arc(fStainX, fStainY, fStainR * 0.85, 0, Math.PI * 2);
            oRoughCtx.fill();
        }

        for (var iRow = 0; iRow <= iSize / iHPlate; iRow++) {
            var fHy = iRow * iHPlate;
            oColorCtx.fillStyle = "#5f6770";
            oColorCtx.fillRect(0, fHy - 1, iSize, 3);
            oBumpCtx.fillStyle = "#bcbcbc";
            oBumpCtx.fillRect(0, fHy - 2, iSize, 5);
            oRoughCtx.fillStyle = "#9a9a9a";
            oRoughCtx.fillRect(0, fHy - 1, iSize, 3);
        }

        for (var iCol = 0; iCol <= iSize / iVPlate; iCol++) {
            var fVx = iCol * iVPlate;
            oColorCtx.fillStyle = "#5f6770";
            oColorCtx.fillRect(fVx - 1, 0, 3, iSize);
            oBumpCtx.fillStyle = "#bcbcbc";
            oBumpCtx.fillRect(fVx - 2, 0, 5, iSize);
        }

        for (var fRy = iHPlate * 0.5; fRy < iSize; fRy += iHPlate) {
            for (var fRx = 8; fRx < iSize; fRx += 13) {
                oColorCtx.beginPath();
                oColorCtx.arc(fRx, fRy, 3, 0, Math.PI * 2);
                oColorCtx.fillStyle = "#3a4249";
                oColorCtx.fill();
                oColorCtx.beginPath();
                oColorCtx.arc(fRx - 0.4, fRy - 0.4, 0.9, 0, Math.PI * 2);
                oColorCtx.fillStyle = "#6d757d";
                oColorCtx.fill();

                oBumpCtx.beginPath();
                oBumpCtx.arc(fRx, fRy, 3.2, 0, Math.PI * 2);
                oBumpCtx.fillStyle = "#a8a8a8";
                oBumpCtx.fill();
            }
        }

        for (n = 0; n < 8000; n++) {
            var fNx = Math.random() * iSize;
            var fNy = Math.random() * iSize;
            var iNoise = 90 + Math.floor(Math.random() * 50);
            oBumpCtx.fillStyle = "rgba(" + iNoise + "," + iNoise + "," + iNoise + ",0.35)";
            oBumpCtx.fillRect(fNx, fNy, 2, 2);
        }

        for (n = 0; n < 4200; n++) {
            var fWx = Math.random() * iSize;
            var fWy = Math.random() * iSize;
            var fWh = 24 + Math.random() * 110;
            oRoughCtx.fillStyle = "rgba(" + (95 + Math.random() * 40) + "," + (95 + Math.random() * 40) + "," + (100 + Math.random() * 40) + ",0.18)";
            oRoughCtx.fillRect(fWx, fWy, 1 + Math.random(), fWh);
        }

        for (n = 0; n < 320; n++) {
            var fSx = Math.random() * iSize;
            var fSy = Math.random() * iSize * 0.2;
            var fSh = 80 + Math.random() * 220;
            oColorCtx.fillStyle = "rgba(68,74,80,0.07)";
            oColorCtx.fillRect(fSx, fSy, 2 + Math.random() * 3, fSh);
            oRoughCtx.fillStyle = "rgba(58,62,66,0.1)";
            oRoughCtx.fillRect(fSx, fSy, 2, fSh);
        }

        var oColorTex = new THREE.CanvasTexture(oColorCanvas);
        var oBumpTex = new THREE.CanvasTexture(oBumpCanvas);
        var oRoughTex = new THREE.CanvasTexture(oRoughCanvas);

        [oColorTex, oBumpTex, oRoughTex].forEach(function (oTex) {
            oTex.wrapS = THREE.RepeatWrapping;
            oTex.wrapT = THREE.RepeatWrapping;
            oTex.repeat.set(5, 3);
            oTex.anisotropy = 4;
        });

        return {
            map: oColorTex,
            bumpMap: oBumpTex,
            roughnessMap: oRoughTex
        };
    }

    function createShellSurfaceMaterial(THREE, oTextures) {
        return new THREE.MeshStandardMaterial({
            color: 0x9aa3ab,
            metalness: 0.4,
            roughness: 0.84,
            map: oTextures.map,
            bumpMap: oTextures.bumpMap,
            bumpScale: 0.32,
            roughnessMap: oTextures.roughnessMap
        });
    }

    function createHexFoundation(THREE, fRadius, fHeight, oMaterial) {
        var oShape = new THREE.Shape();

        for (var i = 0; i < 6; i++) {
            var fAngle = (Math.PI / 3) * i + Math.PI / 6;
            var fX = Math.cos(fAngle) * fRadius;
            var fY = Math.sin(fAngle) * fRadius;

            if (i === 0) {
                oShape.moveTo(fX, fY);
            } else {
                oShape.lineTo(fX, fY);
            }
        }
        oShape.closePath();

        var oGeometry = new THREE.ExtrudeGeometry(oShape, {
            depth: fHeight,
            bevelEnabled: false
        });
        oGeometry.rotateX(-Math.PI / 2);

        return new THREE.Mesh(oGeometry, oMaterial);
    }

    function addShellPlateBands(oRoot, THREE, fRadius, fBaseY, fShellHeight, oBandMaterial, oRivetMaterial) {
        var iPlates = 6;
        var iRivetsPerRing = 42;

        for (var i = 1; i < iPlates; i++) {
            var fBandY = fBaseY + (fShellHeight / iPlates) * i;
            var oBand = new THREE.Mesh(
                new THREE.TorusGeometry(fRadius + 0.02, 0.05, 8, 96),
                oBandMaterial
            );
            oBand.rotation.x = Math.PI / 2;
            oBand.position.y = fBandY;
            oBand.userData.shellCompanion = true;
            oRoot.add(oBand);

            for (var r = 0; r < iRivetsPerRing; r++) {
                var fAngle = (Math.PI * 2 / iRivetsPerRing) * r;
                var fRivetScale = 0.82 + Math.random() * 0.28;
                var oRivet = new THREE.Mesh(
                    new THREE.SphereGeometry(0.036 * fRivetScale, 6, 6),
                    oRivetMaterial
                );
                oRivet.userData.shellCompanion = true;
                oRivet.position.set(
                    Math.cos(fAngle) * (fRadius + 0.05),
                    fBandY + (Math.random() - 0.5) * 0.015,
                    Math.sin(fAngle) * (fRadius + 0.05)
                );
                oRoot.add(oRivet);
            }
        }
    }

    function createWireStrut(THREE, fAx, fAy, fAz, fBx, fBy, fBz, fRadius, oMaterial, sName, iBuildOrder) {
        var fDx = fBx - fAx;
        var fDy = fBy - fAy;
        var fDz = fBz - fAz;
        var fLen = Math.sqrt(fDx * fDx + fDy * fDy + fDz * fDz);

        if (fLen < 0.001) {
            return null;
        }

        var oMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(fRadius, fRadius, fLen, 5),
            oMaterial
        );
        oMesh.name = sName;
        oMesh.position.set((fAx + fBx) / 2, (fAy + fBy) / 2, (fAz + fBz) / 2);

        var oDir = new THREE.Vector3(fDx / fLen, fDy / fLen, fDz / fLen);
        var oQuat = new THREE.Quaternion();
        oQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), oDir);
        oMesh.quaternion.copy(oQuat);

        oMesh.userData.wireCageWire = true;
        oMesh.userData.wireBuildOrder = iBuildOrder;
        return oMesh;
    }

    function addTankWireCage(oRoot, THREE, fRadius, fBaseY, fShellHeight, iVerticals, iRings, oWireMaterial) {
        var fWireRadius = 0.0055;
        var fSurfaceR = fRadius + 0.014;
        var oCageGroup = new THREE.Group();
        oCageGroup.name = "TankWireCage";

        var oMat = oWireMaterial.clone();
        oMat.color.setHex(0x8a939c);
        oMat.metalness = 0.84;
        oMat.roughness = 0.34;

        var aRingY = [];
        var r;

        for (r = 0; r < iRings; r++) {
            aRingY.push(fBaseY + (fShellHeight / (iRings - 1)) * r);
        }

        var aAngles = [];
        var v;

        for (v = 0; v < iVerticals; v++) {
            aAngles.push((Math.PI * 2 / iVerticals) * v);
        }

        function cageXYZ(fAngle, fY) {
            return {
                x: Math.cos(fAngle) * fSurfaceR,
                y: fY,
                z: Math.sin(fAngle) * fSurfaceR
            };
        }

        var iOrder = 0;
        var oWire;

        for (r = 0; r < iRings; r++) {
            for (v = 0; v < iVerticals; v++) {
                var iNext = (v + 1) % iVerticals;
                var oPa = cageXYZ(aAngles[v], aRingY[r]);
                var oPb = cageXYZ(aAngles[iNext], aRingY[r]);
                oWire = createWireStrut(
                    THREE, oPa.x, oPa.y, oPa.z, oPb.x, oPb.y, oPb.z,
                    fWireRadius, oMat, "WireCage_H_" + r + "_" + v, iOrder++
                );

                if (oWire) {
                    oCageGroup.add(oWire);
                }
            }

            if (r < iRings - 1) {
                for (v = 0; v < iVerticals; v++) {
                    var oP0 = cageXYZ(aAngles[v], aRingY[r]);
                    var oP1 = cageXYZ(aAngles[v], aRingY[r + 1]);
                    oWire = createWireStrut(
                        THREE, oP0.x, oP0.y, oP0.z, oP1.x, oP1.y, oP1.z,
                        fWireRadius, oMat, "WireCage_V_" + r + "_" + v, iOrder++
                    );

                    if (oWire) {
                        oCageGroup.add(oWire);
                    }
                }

                for (v = 0; v < iVerticals; v++) {
                    var iNextCell = (v + 1) % iVerticals;
                    var oP00 = cageXYZ(aAngles[v], aRingY[r]);
                    var oP11 = cageXYZ(aAngles[iNextCell], aRingY[r + 1]);
                    var oP01 = cageXYZ(aAngles[iNextCell], aRingY[r]);
                    var oP10 = cageXYZ(aAngles[v], aRingY[r + 1]);

                    oWire = createWireStrut(
                        THREE, oP00.x, oP00.y, oP00.z, oP11.x, oP11.y, oP11.z,
                        fWireRadius * 0.9, oMat, "WireCage_D1_" + r + "_" + v, iOrder++
                    );

                    if (oWire) {
                        oCageGroup.add(oWire);
                    }

                    oWire = createWireStrut(
                        THREE, oP01.x, oP01.y, oP01.z, oP10.x, oP10.y, oP10.z,
                        fWireRadius * 0.9, oMat, "WireCage_D2_" + r + "_" + v, iOrder++
                    );

                    if (oWire) {
                        oCageGroup.add(oWire);
                    }
                }
            }
        }

        oCageGroup.userData._wireBuildCount = iOrder;
        oRoot.add(oCageGroup);
        return oCageGroup;
    }

    function addTankShell(oRoot, THREE, fRadius, fBaseY, fShellHeight, oShellMaterial) {
        var oShellGroup = new THREE.Group();
        oShellGroup.name = "TankShell";
        oShellGroup.position.y = fBaseY + fShellHeight / 2;

        var oShellBody = new THREE.Mesh(
            new THREE.CylinderGeometry(fRadius, fRadius, fShellHeight, 96, 4, true),
            oShellMaterial
        );
        oShellBody.name = "TankShellBody";
        oShellGroup.add(oShellBody);

        oRoot.add(oShellGroup);
        return oShellGroup;
    }

    function forEachWireCageWire(oNode, fnCallback) {
        oNode.traverse(function (oChild) {
            if (oChild.isMesh && oChild.userData.wireCageWire) {
                fnCallback(oChild);
            }
        });
    }

    function addSideServicePipe(oRoot, THREE, fRadius, fBaseY, fShellHeight, fSideAngle, oPipeMaterial) {
        var fPipeX = Math.cos(fSideAngle) * (fRadius + 0.38);
        var fPipeZ = Math.sin(fSideAngle) * (fRadius + 0.38);
        var oPipeGroup = new THREE.Group();
        oPipeGroup.name = "SideServicePipe";
        oPipeGroup.position.set(fPipeX, 0, fPipeZ);
        oPipeGroup.rotation.y = -fSideAngle + Math.PI / 2;

        var oVerticalMaterial = oPipeMaterial.clone();
        var oVerticalPipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, fShellHeight + 0.6, 20),
            oVerticalMaterial
        );
        oVerticalPipe.name = "InboundVerticalPipe";
        oVerticalPipe.position.y = fBaseY + fShellHeight / 2;
        oPipeGroup.add(oVerticalPipe);

        var oElbow = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.14, 10, 20, Math.PI / 2),
            oPipeMaterial
        );
        oElbow.rotation.y = Math.PI / 2;
        oElbow.rotation.z = Math.PI;
        oElbow.position.set(0.18, fBaseY + 0.18, 0);
        oPipeGroup.add(oElbow);

        var oGroundPipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 1.6, 20),
            oPipeMaterial
        );
        oGroundPipe.rotation.z = Math.PI / 2;
        oGroundPipe.position.set(0.98, fBaseY + 0.18, 0);
        oPipeGroup.add(oGroundPipe);

        var oValve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.18, 16),
            oPipeMaterial
        );
        oValve.rotation.z = Math.PI / 2;
        oValve.position.set(0.45, fBaseY + 1.4, 0);
        oPipeGroup.add(oValve);

        oRoot.add(oPipeGroup);
    }

    function addRoofHandrails(oRoot, THREE, fRadius, fRailY, oRailMaterial) {
        var iPosts = 18;
        var fPostHeight = 0.55;

        for (var i = 0; i < iPosts; i++) {
            var fAngle = (Math.PI * 2 / iPosts) * i;
            var fX = Math.cos(fAngle) * (fRadius + 0.08);
            var fZ = Math.sin(fAngle) * (fRadius + 0.08);
            var oPost = new THREE.Mesh(
                new THREE.CylinderGeometry(0.045, 0.045, fPostHeight, 8),
                oRailMaterial
            );
            oPost.position.set(fX, fRailY + fPostHeight / 2, fZ);
            oRoot.add(oPost);
        }

        [0.2, 0.38, 0.55].forEach(function (fOffset) {
            var oRail = new THREE.Mesh(
                new THREE.TorusGeometry(fRadius + 0.08, 0.03, 6, 72),
                oRailMaterial
            );
            oRail.rotation.x = Math.PI / 2;
            oRail.position.y = fRailY + fOffset;
            oRoot.add(oRail);
        });
    }

    function addCagedLadder(oRoot, THREE, fRadius, fBaseY, fTopY, fSideAngle, oSteelMaterial) {
        var fLadderX = Math.cos(fSideAngle) * (fRadius + 0.55);
        var fLadderZ = Math.sin(fSideAngle) * (fRadius + 0.55);
        var fLadderHeight = fTopY - fBaseY + 0.4;
        var fCenterY = fBaseY + fLadderHeight / 2;
        var oLadderGroup = new THREE.Group();
        oLadderGroup.name = "CagedAccessLadder";
        oLadderGroup.position.set(fLadderX, 0, fLadderZ);
        oLadderGroup.rotation.y = -fSideAngle + Math.PI / 2;

        [-0.28, 0.28].forEach(function (fOffsetX) {
            var oRail = new THREE.Mesh(
                new THREE.BoxGeometry(0.06, fLadderHeight, 0.06),
                oSteelMaterial
            );
            oRail.position.set(fOffsetX, fCenterY, 0);
            oLadderGroup.add(oRail);
        });

        var iRungs = 14;
        for (var i = 0; i < iRungs; i++) {
            var oRung = new THREE.Mesh(
                new THREE.BoxGeometry(0.56, 0.04, 0.05),
                oSteelMaterial
            );
            oRung.position.y = fBaseY + 0.5 + (fLadderHeight - 1) * (i / (iRungs - 1));
            oLadderGroup.add(oRung);
        }

        var iCageHoops = 7;
        for (var j = 0; j < iCageHoops; j++) {
            var oHoop = new THREE.Mesh(
                new THREE.TorusGeometry(0.34, 0.025, 6, 20, Math.PI),
                oSteelMaterial
            );
            oHoop.rotation.y = Math.PI / 2;
            oHoop.position.y = fBaseY + 2 + j * 0.85;
            oLadderGroup.add(oHoop);
        }

        oRoot.add(oLadderGroup);
    }

    function addLevelGauge(oRoot, THREE, fRadius, fBaseY, fShellHeight, fGaugeAngle, oBoardMaterial, oSteelMaterial) {
        var fGaugeX = Math.cos(fGaugeAngle) * (fRadius + 0.12);
        var fGaugeZ = Math.sin(fGaugeAngle) * (fRadius + 0.12);
        var oGaugeGroup = new THREE.Group();
        oGaugeGroup.name = "BoardLevelGauge";
        oGaugeGroup.position.set(fGaugeX, fBaseY + fShellHeight * 0.55, fGaugeZ);
        oGaugeGroup.rotation.y = -fGaugeAngle + Math.PI / 2;

        var oBoard = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, fShellHeight * 0.72, 0.55),
            oBoardMaterial
        );
        oGaugeGroup.add(oBoard);

        var oScale = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, fShellHeight * 0.62, 0.04),
            oSteelMaterial
        );
        oScale.position.set(0.06, 0, 0.22);
        oGaugeGroup.add(oScale);

        var oFloat = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 12, 12),
            oSteelMaterial
        );
        oFloat.name = "LevelGaugeFloat";
        oFloat.position.set(0.1, -fShellHeight * 0.12, 0.22);
        oGaugeGroup.add(oFloat);

        var fGaugeSpan = fShellHeight * 0.31;
        var oGaugeLiquid = new THREE.Mesh(
            new THREE.BoxGeometry(0.022, 0.01, 0.032),
            new THREE.MeshPhysicalMaterial({
                color: 0x2E7D32,
                metalness: 0.05,
                roughness: 0.18,
                transparent: true,
                opacity: 0.9
            })
        );
        oGaugeLiquid.name = "LevelGaugeLiquid";
        oGaugeLiquid.position.set(0.06, -fGaugeSpan + 0.005, 0.22);
        oGaugeGroup.add(oGaugeLiquid);

        oGaugeGroup.userData.gaugeLiquidSpan = fGaugeSpan * 2;
        oGaugeGroup.userData.gaugeLiquidBottom = -fGaugeSpan;

        oRoot.add(oGaugeGroup);
    }

    function createLiquidSurfaceMaterial(THREE, iFillColor, fLiquidRadius) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(iFillColor) },
                uWaveHeight: { value: 0.028 },
                uRippleScale: { value: 3.0 },
                uAmbientSlosh: { value: 0.022 },
                uMaxWaveHeight: { value: 0.042 },
                uSloshAmp: { value: new THREE.Vector2(0, 0) },
                uSloshChop: { value: new THREE.Vector2(0, 0) },
                uSloshFlow: { value: new THREE.Vector2(0, 0) },
                uSloshPhase: { value: 0 },
                uLiquidRadius: { value: fLiquidRadius }
            },
            vertexShader: [
                "uniform float uTime;",
                "uniform float uWaveHeight;",
                "uniform float uRippleScale;",
                "uniform float uAmbientSlosh;",
                "uniform float uMaxWaveHeight;",
                "uniform vec2 uSloshAmp;",
                "uniform vec2 uSloshChop;",
                "uniform vec2 uSloshFlow;",
                "uniform float uSloshPhase;",
                "uniform float uLiquidRadius;",
                "varying vec3 vNormal;",
                "varying vec3 vViewDir;",
                "varying float vWaveHeight;",
                "void main() {",
                "  vec3 pos = position;",
                "  float r = length(pos.xy);",
                "  float radial = clamp(r / uLiquidRadius, 0.0, 1.0);",
                "  float radial2 = radial * radial;",
                "  float theta = atan(pos.y, pos.x);",
                "  vec2 worldXZ = vec2(pos.x, -pos.y);",
                "  float fundX = uSloshAmp.x * worldXZ.x / uLiquidRadius * radial;",
                "  float fundZ = uSloshAmp.y * worldXZ.y / uLiquidRadius * radial;",
                "  float sloshFund = fundX + fundZ;",
                "  float mode2 = uSloshChop.x * cos(2.0 * theta + uSloshPhase) * radial2 * 0.22;",
                "  float mode3 = uSloshChop.y * sin(2.0 * theta - uSloshPhase * 0.8) * radial2 * 0.14;",
                "  float flowMag = length(uSloshFlow);",
                "  vec2 flowDir = flowMag > 0.001 ? normalize(uSloshFlow) : vec2(0.0);",
                "  float travel = sin(dot(worldXZ, flowDir) * 0.62 - uTime * 0.62 + uSloshPhase) * flowMag * 0.05 * radial;",
                "  float edgeDamp = smoothstep(uLiquidRadius, uLiquidRadius - 0.7, r);",
                "  float ambient1 = sin(theta + uTime * 0.22) * radial * uAmbientSlosh;",
                "  float ambient2 = cos(theta * 2.0 - uTime * 0.28) * radial2 * uAmbientSlosh * 0.35;",
                "  float ripple = sin(r * uRippleScale - uTime * 0.45) * uWaveHeight * edgeDamp;",
                "  float crossWave = sin(pos.x * 2.2 + uTime * 0.52) * cos(pos.y * 2.0 - uTime * 0.38) * uWaveHeight * 0.35 * edgeDamp;",
                "  float wallBand = smoothstep(uLiquidRadius - 0.25, uLiquidRadius - 0.04, r);",
                "  float wallSurge = wallBand * max(sloshFund, 0.0) * 0.1;",
                "  float wallRecede = wallBand * min(sloshFund, 0.0) * 0.06;",
                "  float height = sloshFund + mode2 + mode3 + travel + ambient1 + ambient2 + ripple + crossWave + wallSurge + wallRecede;",
                "  height = clamp(height, -uMaxWaveHeight * 0.45, uMaxWaveHeight);",
                "  pos.z += height;",
                "  float dFundX = uSloshAmp.x / uLiquidRadius * radial;",
                "  float dFundZ = uSloshAmp.y / uLiquidRadius * radial;",
                "  float dMode2 = -uSloshChop.x * sin(2.0 * theta + uSloshPhase) * 2.0 * radial * 0.42;",
                "  float dMode3 = uSloshChop.y * cos(2.0 * theta - uSloshPhase * 0.8) * 2.0 * radial * 0.28;",
                "  float dTravel = cos(dot(worldXZ, flowDir) * 0.62 - uTime * 0.62 + uSloshPhase) * flowMag * 0.14 * 0.62 * radial;",
                "  float eps = 0.11;",
                "  float hL = dFundX * (worldXZ.x - eps) / uLiquidRadius * clamp(length(vec2(worldXZ.x - eps, worldXZ.y)) / uLiquidRadius, 0.0, 1.0);",
                "  float hR = dFundX * (worldXZ.x + eps) / uLiquidRadius * clamp(length(vec2(worldXZ.x + eps, worldXZ.y)) / uLiquidRadius, 0.0, 1.0);",
                "  float hD = dFundZ * (worldXZ.y - eps) / uLiquidRadius * clamp(length(vec2(worldXZ.x, worldXZ.y - eps)) / uLiquidRadius, 0.0, 1.0);",
                "  float hU = dFundZ * (worldXZ.y + eps) / uLiquidRadius * clamp(length(vec2(worldXZ.x, worldXZ.y + eps)) / uLiquidRadius, 0.0, 1.0);",
                "  vNormal = normalize(vec3((hL - hR) / (2.0 * eps), (hD - hU) / (2.0 * eps), 1.0));",
                "  vWaveHeight = height;",
                "  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);",
                "  vViewDir = -mvPos.xyz;",
                "  gl_Position = projectionMatrix * mvPos;",
                "}"
            ].join("\n"),
            fragmentShader: [
                "uniform vec3 uColor;",
                "varying vec3 vNormal;",
                "varying vec3 vViewDir;",
                "varying float vWaveHeight;",
                "void main() {",
                "  vec3 normal = normalize(vNormal);",
                "  vec3 lightDir = normalize(vec3(0.25, 0.92, 0.38));",
                "  vec3 halfDir = normalize(lightDir + normalize(vViewDir));",
                "  float diffuse = max(dot(normal, lightDir), 0.0);",
                "  float spec = pow(max(dot(normal, halfDir), 0.0), 72.0);",
                "  float fresnel = pow(1.0 - max(dot(normal, normalize(vViewDir)), 0.0), 2.8);",
                "  float crest = smoothstep(0.02, 0.14, vWaveHeight);",
                "  vec3 deepCol = uColor * 0.72;",
                "  vec3 crestCol = uColor * 1.12 + vec3(0.06, 0.08, 0.1);",
                "  vec3 col = mix(deepCol, crestCol, crest);",
                "  col *= 0.46 + diffuse * 0.54;",
                "  col += vec3(0.28, 0.34, 0.42) * spec * (0.35 + crest * 0.45);",
                "  col += vec3(0.18, 0.22, 0.3) * fresnel * 0.5;",
                "  gl_FragColor = vec4(col, 0.92);",
                "}"
            ].join("\n"),
            transparent: true,
            depthWrite: true,
            side: THREE.DoubleSide
        });
    }

    function createBottomAnchoredCylinderGeometry(THREE, fRadius, fHeight) {
        var oGeometry = new THREE.CylinderGeometry(fRadius, fRadius, fHeight, 64);
        oGeometry.translate(0, fHeight / 2, 0);
        return oGeometry;
    }

    function computeLiquidFillDimensions(fUsableShellHeight, fLevel) {
        var fClamped = Math.max(0, Math.min(fLevel, 1));
        var fFillHeight = fUsableShellHeight * fClamped;
        var fBodyHeight = fFillHeight > 0.001
            ? Math.max(fFillHeight - 0.06, fFillHeight * 0.96)
            : 0;

        return {
            fillHeight: fFillHeight,
            bodyHeight: fBodyHeight
        };
    }

    function createInventoryFill(THREE, fRadius, fUsableShellHeight, fFloorY, iFillColor, fLevel) {
        var oDims = computeLiquidFillDimensions(fUsableShellHeight, fLevel);
        var oFillGroup = new THREE.Group();
        var fLiquidRadius = fRadius - 0.38;
        var fBodyHeight = oDims.bodyHeight;

        oFillGroup.name = "InventoryFill";

        var oFillAnchor = new THREE.Group();
        oFillAnchor.name = "InventoryFillAnchor";
        oFillAnchor.position.y = fFloorY;
        oFillGroup.add(oFillAnchor);

        var oFillBodyMaterial = new THREE.MeshPhysicalMaterial({
            color: iFillColor,
            metalness: 0.02,
            roughness: 0.12,
            transparent: true,
            opacity: 0.92,
            transmission: 0.22,
            thickness: 0.9,
            ior: 1.33
        });

        var oBody = new THREE.Mesh(
            createBottomAnchoredCylinderGeometry(THREE, fLiquidRadius, fBodyHeight),
            oFillBodyMaterial
        );
        oBody.name = "InventoryFillBody";
        oBody.position.y = 0;
        oFillAnchor.add(oBody);

        var fSurfaceRadius = fLiquidRadius * 0.97;
        var oSurfaceMaterial = createLiquidSurfaceMaterial(THREE, iFillColor, fSurfaceRadius);
        oSurfaceMaterial.polygonOffset = true;
        oSurfaceMaterial.polygonOffsetFactor = -2;
        oSurfaceMaterial.polygonOffsetUnits = -2;
        var oSurface = new THREE.Mesh(
            new THREE.CircleGeometry(fSurfaceRadius, 128),
            oSurfaceMaterial
        );
        oSurface.name = "InventoryFillSurface";
        oSurface.rotation.x = -Math.PI / 2;
        oSurface.position.y = fBodyHeight + 0.025;
        oSurface.renderOrder = 5;
        oFillAnchor.add(oSurface);

        oFillGroup.userData.liquidSurfaceMaterial = oSurfaceMaterial;
        oFillGroup.userData.liquidRadius = fLiquidRadius;
        oFillGroup.userData.liquidSurfaceBaseY = fFloorY + fBodyHeight + 0.025;
        oFillGroup.userData.liquidBodyBaseY = fFloorY;
        oFillGroup.userData.usableShellHeight = fUsableShellHeight;
        oFillGroup.userData.fillFloorY = fFloorY;

        return oFillGroup;
    }

    function updateInventoryFillLevel(oFillGroup, THREE, fRadius, fUsableShellHeight, fFloorY, fLevel) {
        var oDims = computeLiquidFillDimensions(fUsableShellHeight, fLevel);
        var fLiquidRadius = fRadius - 0.38;
        var fBodyHeight = oDims.bodyHeight;
        var oFillAnchor = oFillGroup.getObjectByName("InventoryFillAnchor");
        var oBody = oFillGroup.getObjectByName("InventoryFillBody");
        var oSurface = oFillGroup.getObjectByName("InventoryFillSurface");

        if (!oFillAnchor || !oBody || !oSurface) {
            return;
        }

        oFillAnchor.position.y = fFloorY;

        if (oBody.geometry) {
            oBody.geometry.dispose();
        }

        oBody.geometry = createBottomAnchoredCylinderGeometry(THREE, fLiquidRadius, fBodyHeight);
        oBody.position.y = 0;
        oSurface.position.y = fBodyHeight + 0.025;

        oFillGroup.userData.liquidSurfaceBaseY = fFloorY + fBodyHeight + 0.025;
        oFillGroup.userData.liquidBodyBaseY = fFloorY;
        oFillGroup.userData.fillFloorY = fFloorY;
    }

    function ensureInboundPipeFlowIndicator(oTankGroup, THREE) {
        if (oTankGroup.getObjectByName("InboundPipeFlow")) {
            return;
        }

        var oServicePipe = oTankGroup.getObjectByName("SideServicePipe");
        var m = oTankGroup.userData.tankMetrics;

        if (!oServicePipe || !m) {
            return;
        }

        var fPipeHeight = m.shellHeight + 0.6;
        var fPipeCenterY = m.baseY + m.shellHeight / 2;
        var fPipeBottomY = fPipeCenterY - fPipeHeight / 2;
        var fPipeTopY = fPipeCenterY + fPipeHeight / 2;
        var oFlowGroup = new THREE.Group();
        oFlowGroup.name = "InboundPipeFlow";
        oFlowGroup.userData.pipeBottomY = fPipeBottomY;
        oFlowGroup.userData.pipeTopY = fPipeTopY;

        for (var i = 0; i < 6; i++) {
            var oDrop = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 10, 10),
                new THREE.MeshBasicMaterial({
                    color: 0x4FC3F7,
                    transparent: true,
                    opacity: 0.95,
                    depthWrite: false
                })
            );
            oDrop.name = "InboundPipeFlowDrop";
            oDrop.renderOrder = 12;
            oDrop.userData.flowPhase = i / 6;
            oFlowGroup.add(oDrop);
        }

        for (var j = 0; j < 3; j++) {
            var oRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.17, 0.035, 8, 20),
                new THREE.MeshBasicMaterial({
                    color: 0x2196F3,
                    transparent: true,
                    opacity: 0.85,
                    depthWrite: false
                })
            );
            oRing.name = "InboundPipeFlowRing";
            oRing.rotation.x = Math.PI / 2;
            oRing.renderOrder = 11;
            oRing.userData.flowPhase = j / 3 + 0.15;
            oFlowGroup.add(oRing);
        }

        oServicePipe.add(oFlowGroup);
    }

    function ensureQualityPendingPulseRing(oTankGroup, THREE) {
        if (oTankGroup.getObjectByName("InventoryFillEdgePulse")) {
            return;
        }

        var oFillGroup = oTankGroup.getObjectByName("InventoryFill");
        var fLiquidRadius = 4.82;

        if (oTankGroup.userData.tankMetrics) {
            fLiquidRadius = oTankGroup.userData.tankMetrics.radius - 0.38;
        }

        var oRing = new THREE.Mesh(
            new THREE.TorusGeometry(fLiquidRadius * 0.97, 0.07, 10, 72),
            new THREE.MeshBasicMaterial({
                color: 0xEF6C00,
                transparent: true,
                opacity: 0.55,
                depthWrite: false
            })
        );
        oRing.name = "InventoryFillEdgePulse";
        oRing.rotation.x = Math.PI / 2;
        oRing.visible = false;

        if (oFillGroup) {
            var oFillAnchor = oFillGroup.getObjectByName("InventoryFillAnchor");

            if (oFillAnchor) {
                oFillAnchor.add(oRing);
                return;
            }
        }

        oTankGroup.add(oRing);
    }

    function buildIndustrialTank(THREE, oConfig) {
        var fRadius = 5.6;
        var fShellHeight = 6.2;
        var fRoofHeight = 1.05;
        var fFoundationHeight = 0.65;
        var fBaseY = fFoundationHeight;
        var fShellTopY = fBaseY + fShellHeight;
        var fRoofBaseY = fShellTopY;
        var fFillLevel = Math.max(0, Math.min(oConfig.fillLevel || 0, 1));
        var iFillColor = oConfig.fillColor || 0x2E7D32;
        var oRoot = new THREE.Group();
        oRoot.name = "StorageTank";

        var oSteelTextures = createGalvanizedSteelTextures(THREE);
        var oShellMaterial = createShellSurfaceMaterial(THREE, oSteelTextures);
        var oSeamMaterial = new THREE.MeshStandardMaterial({
            color: 0x6d747b,
            metalness: 0.42,
            roughness: 0.78
        });
        var oBlackPipeMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e2228,
            metalness: 0.2,
            roughness: 0.88
        });
        var oConcreteMaterial = new THREE.MeshStandardMaterial({
            color: 0x9A9A96,
            metalness: 0.05,
            roughness: 0.92
        });
        var oSteelMaterial = new THREE.MeshStandardMaterial({
            color: 0x636b73,
            metalness: 0.5,
            roughness: 0.72
        });
        var oPipeMaterial = new THREE.MeshStandardMaterial({
            color: 0x525a62,
            metalness: 0.45,
            roughness: 0.76
        });
        var oBoardMaterial = new THREE.MeshStandardMaterial({
            color: 0xECEFF1,
            metalness: 0.1,
            roughness: 0.8
        });
        var oFoundation = createHexFoundation(THREE, fRadius + 1.1, fFoundationHeight, oConcreteMaterial);
        oFoundation.name = "Foundation";
        oFoundation.position.y = fFoundationHeight / 2;
        oRoot.add(oFoundation);

        var oBottomPlate = new THREE.Mesh(
            new THREE.CylinderGeometry(fRadius - 0.05, fRadius - 0.05, 0.12, 72),
            oSeamMaterial
        );
        oBottomPlate.name = "BasePlate";
        oBottomPlate.position.y = fBaseY + 0.06;
        oRoot.add(oBottomPlate);

        var oBitumenSeal = new THREE.Mesh(
            new THREE.TorusGeometry(fRadius + 0.04, 0.09, 8, 72),
            new THREE.MeshStandardMaterial({ color: 0x3E4246, metalness: 0.2, roughness: 0.85 })
        );
        oBitumenSeal.rotation.x = Math.PI / 2;
        oBitumenSeal.position.y = fBaseY + 0.12;
        oRoot.add(oBitumenSeal);

        addTankShell(oRoot, THREE, fRadius, fBaseY, fShellHeight, oShellMaterial);
        addTankWireCage(oRoot, THREE, fRadius, fBaseY, fShellHeight, TANK_WIRE_CAGE_VERTICALS, TANK_WIRE_CAGE_RINGS, oSeamMaterial);

        var oTopRim = new THREE.Mesh(
            new THREE.TorusGeometry(fRadius + 0.06, 0.1, 10, 96),
            oSeamMaterial
        );
        oTopRim.rotation.x = Math.PI / 2;
        oTopRim.position.y = fShellTopY + 0.04;
        oTopRim.userData.shellCompanion = true;
        oRoot.add(oTopRim);

        var oWindGirder = new THREE.Mesh(
            new THREE.TorusGeometry(fRadius + 0.22, 0.16, 12, 72),
            oSeamMaterial
        );
        oWindGirder.name = "WindGirder";
        oWindGirder.rotation.x = Math.PI / 2;
        oWindGirder.position.y = fBaseY + fShellHeight * 0.52;
        oRoot.add(oWindGirder);

        var fTargetFillLevel = fFillLevel;
        var fInitialFillLevel = typeof oConfig.initialFillLevel === "number" ? oConfig.initialFillLevel : fTargetFillLevel;
        var fFillFloorY = fBaseY + TANK_FILL_FLOOR_OFFSET;
        var fUsableShellHeight = fShellHeight - TANK_FILL_FLOOR_OFFSET;

        if (fTargetFillLevel > 0.01 || fInitialFillLevel > 0.001) {
            if (fInitialFillLevel > 0.001) {
                oRoot.add(createInventoryFill(THREE, fRadius, fUsableShellHeight, fFillFloorY, iFillColor, fInitialFillLevel));
            }
            oRoot.userData.targetFillLevel = fTargetFillLevel;
        }

        oRoot.userData.tankMetrics = {
            shellHeight: fShellHeight,
            baseY: fBaseY,
            fillFloorY: fFillFloorY,
            usableShellHeight: fUsableShellHeight,
            radius: fRadius
        };
        oRoot.userData.statusCode = (oConfig.statusCode || "E").toUpperCase();

        var oRoofDeck = new THREE.Mesh(
            new THREE.CylinderGeometry(fRadius + 0.04, fRadius + 0.04, 0.1, 72),
            oShellMaterial
        );
        oRoofDeck.name = "RoofDeck";
        oRoofDeck.position.y = fRoofBaseY + 0.05;
        oRoot.add(oRoofDeck);

        var oRoof = new THREE.Mesh(
            new THREE.ConeGeometry(fRadius + 0.06, fRoofHeight, 96, 6),
            oShellMaterial.clone()
        );
        oRoof.name = "ConicalRoof";
        oRoof.position.y = fRoofBaseY + fRoofHeight / 2 + 0.1;
        oRoot.add(oRoof);

        var iRoofRibs = 12;
        for (var r = 0; r < iRoofRibs; r++) {
            var fRibAngle = (Math.PI * 2 / iRoofRibs) * r;
            var oRib = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, fRoofHeight * 0.92, 0.05),
                oSeamMaterial
            );
            oRib.position.set(
                Math.cos(fRibAngle) * (fRadius * 0.45),
                fRoofBaseY + fRoofHeight * 0.45,
                Math.sin(fRibAngle) * (fRadius * 0.45)
            );
            oRib.rotation.y = -fRibAngle;
            oRib.rotation.z = Math.atan2(fRoofHeight, fRadius);
            oRoot.add(oRib);
        }

        addRoofHandrails(oRoot, THREE, fRadius, fRoofBaseY + fRoofHeight + 0.08, oSteelMaterial);

        var oVentPipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.75, 16),
            oPipeMaterial
        );
        oVentPipe.name = "VentPipe";
        oVentPipe.position.y = fRoofBaseY + fRoofHeight + 0.55;
        oRoot.add(oVentPipe);

        var oVentCage = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.35, 12, 1, true),
            oSteelMaterial
        );
        oVentCage.name = "VentCage";
        oVentCage.position.y = fRoofBaseY + fRoofHeight + 0.92;
        oRoot.add(oVentCage);

        var oDipHatch = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.08, 0.45),
            oSteelMaterial
        );
        oDipHatch.name = "DipHatch";
        oDipHatch.position.set(fRadius * 0.35, fRoofBaseY + 0.18, fRadius * 0.2);
        oRoot.add(oDipHatch);

        var oRoofManhole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.28, 0.1, 24),
            oSteelMaterial
        );
        oRoofManhole.name = "RoofManhole";
        oRoofManhole.position.set(-fRadius * 0.25, fRoofBaseY + 0.18, -fRadius * 0.3);
        oRoot.add(oRoofManhole);

        var oFillPipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 1.1, 16),
            oPipeMaterial
        );
        oFillPipe.name = "FillPipe";
        oFillPipe.position.set(-fRadius * 0.55, fRoofBaseY + 0.65, fRadius * 0.45);
        oRoot.add(oFillPipe);

        addCagedLadder(oRoot, THREE, fRadius, fBaseY, fRoofBaseY + fRoofHeight, 0, oSteelMaterial);
        addSideServicePipe(oRoot, THREE, fRadius, fBaseY, fShellHeight, 0.22, oBlackPipeMaterial);
        addLevelGauge(oRoot, THREE, fRadius, fBaseY, fShellHeight, Math.PI * 0.55, oBoardMaterial, oSteelMaterial);

        var fManholeY = fBaseY + 1.15;
        var fManholeAngle = Math.PI * 1.12;
        var fManholeX = Math.cos(fManholeAngle) * (fRadius + 0.05);
        var fManholeZ = Math.sin(fManholeAngle) * (fRadius + 0.05);
        var oManholeGroup = new THREE.Group();
        oManholeGroup.name = "ShellManhole";
        oManholeGroup.position.set(fManholeX, fManholeY, fManholeZ);
        oManholeGroup.rotation.y = -fManholeAngle + Math.PI / 2;
        var oManhole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.42, 0.12, 32),
            oSteelMaterial
        );
        oManhole.rotation.x = Math.PI / 2;
        oManholeGroup.add(oManhole);
        oRoot.add(oManholeGroup);

        var oDavit = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.08, 1.1),
            oSteelMaterial
        );
        oDavit.name = "ManholeDavit";
        oDavit.position.set(fManholeX + 0.35, fManholeY + 0.55, fManholeZ + 0.2);
        oDavit.rotation.y = -fManholeAngle + 0.4;
        oDavit.rotation.z = -0.55;
        oRoot.add(oDavit);

        var oCleanOut = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 0.9, 16),
            oPipeMaterial
        );
        oCleanOut.name = "DrawOffCleanOut";
        oCleanOut.rotation.z = Math.PI / 2;
        oCleanOut.position.set(fRadius + 0.45, fBaseY + 0.35, -fRadius * 0.55);
        oRoot.add(oCleanOut);

        var oHemiLight = new THREE.HemisphereLight(0xb8c0c8, 0x5c636a, 0.55);
        oRoot.add(oHemiLight);
        oRoot.add(new THREE.AmbientLight(0xc8cdd2, 0.32));

        var oKeyLight = new THREE.DirectionalLight(0xd8dde2, 0.38);
        oKeyLight.position.set(10, 16, 12);
        oRoot.add(oKeyLight);

        var oFillLight = new THREE.DirectionalLight(0x98a0a8, 0.18);
        oFillLight.position.set(-12, 8, -10);
        oRoot.add(oFillLight);

        stampTankAssemblyPhases(oRoot);

        return oRoot;
    }

    function easeOutBackAssembly(fT) {
        var fC1 = 1.70158;
        var fC3 = fC1 + 1;
        return 1 + fC3 * Math.pow(fT - 1, 3) + fC1 * Math.pow(fT - 1, 2);
    }

    function easeInOutCubic(fT) {
        return fT < 0.5
            ? 4 * fT * fT * fT
            : 1 - Math.pow(-2 * fT + 2, 3) / 2;
    }

    function stampTankAssemblyPhases(oRoot) {
        var m = oRoot.userData.tankMetrics;
        var fBaseY = m ? m.baseY : 0.65;
        var fShellTop = m ? (m.baseY + m.shellHeight) : 6.85;
        var oNamedPhases = {
            Foundation: 0,
            BasePlate: 1,
            TankWireCage: 2,
            TankShell: 3,
            WindGirder: 4,
            RoofDeck: 5,
            ConicalRoof: 5,
            VentPipe: 6,
            VentCage: 6,
            DipHatch: 6,
            RoofManhole: 6,
            FillPipe: 6,
            CagedAccessLadder: 7,
            SideServicePipe: 7,
            BoardLevelGauge: 7,
            ShellManhole: 8,
            ManholeDavit: 8,
            DrawOffCleanOut: 8,
            InventoryFill: 99
        };

        oRoot.traverse(function (oNode) {
            if (oNode.isLight) {
                oNode.userData.assemblySkip = true;
                return;
            }

            if (oNode.name === "InboundPipeFlow" || oNode.name === "InventoryFillEdgePulse") {
                oNode.userData.assemblySkip = true;
                return;
            }

            if (oNode.name && oNamedPhases[oNode.name] !== undefined) {
                oNode.userData.assemblyPhase = oNamedPhases[oNode.name];
                return;
            }

            if (oNode.parent && (oNode.parent.name === "InventoryFill" || oNode.parent.name === "InventoryFillAnchor")) {
                oNode.userData.assemblySkip = true;
                return;
            }

            if (oNode.parent && oNode.parent.name === "TankWireCage") {
                oNode.userData.assemblySkip = true;
                return;
            }

            if (oNode.parent && oNode.parent.name === "TankShell") {
                oNode.userData.assemblySkip = true;
                return;
            }

            if (oNode === oRoot || (!oNode.isMesh && !oNode.isGroup)) {
                return;
            }

            if (oNode.parent !== oRoot) {
                return;
            }

            var fY = oNode.position.y;

            if (fY < fBaseY + 0.2) {
                oNode.userData.assemblyPhase = 1;
            } else if (fY < fShellTop - 0.4) {
                oNode.userData.assemblyPhase = 4;
            } else if (fY < fShellTop + 1.2) {
                oNode.userData.assemblyPhase = 5;
            } else {
                oNode.userData.assemblyPhase = 6;
            }
        });
    }

    function clearSceneNode(oParentNode) {
        var iChildCount = oParentNode.children.length;

        while (iChildCount--) {
            var oChild = oParentNode.children[iChildCount];
            oParentNode.remove(oChild);

            if (oChild.traverse) {
                oChild.traverse(function (oNode) {
                    if (oNode.geometry) {
                        oNode.geometry.dispose();
                    }
                    if (oNode.material) {
                        if (Array.isArray(oNode.material)) {
                            oNode.material.forEach(function (oMat) {
                                oMat.dispose();
                            });
                        } else {
                            oNode.material.dispose();
                        }
                    }
                });
            }
        }
    }

    function registerTankModelResolver() {
        if (bTankModelResolverRegistered) {
            return;
        }

        ContentConnector.addContentManagerResolver({
            pattern: TANK_MODEL_SOURCE_TYPE,
            dimension: 3,
            contentManagerClassName: "sap.ui.vk.threejs.ContentManager",
            settings: {
                loader: function (oParentNode, oContentResource) {
                    return new Promise(function (resolve) {
                        clearSceneNode(oParentNode);
                        var oConfig = Object.assign({
                            name: oContentResource.getSourceId() || "StorageTank"
                        }, oTankSceneConfigStore);
                        var oTank = buildIndustrialTank(THREE, oConfig);
                        oParentNode.add(oTank);
                        resolve({
                            node: oParentNode,
                            contentResource: oContentResource
                        });
                    });
                }
            }
        });

        bTankModelResolverRegistered = true;
    }

    return Controller.extend("test.t1.test.inventory.controller.TankDetail", {

        onInit: function () {
            this._sWerks = "";
            this._sLgort = "";
            this._bViewportReady = false;
            this._bInteriorViewActive = false;
            this._bShellPeelAnimActive = false;
            this._iShellPeelFrame = null;
            this._fnShellPeelComplete = null;
            this._fnTickShellPeel = null;
            this._oShellPeelShell = null;
            this._fnViewportDblClick = null;
            this._oTankSceneContent = null;
            this._oInventoryMeasureDialog = null;
            this._bInventoryMeasureDialogLoaded = false;
            this._bMeasurePreviewActive = false;
            this._fBaselineFillLevel = 0;
            this._fCurrentDisplayFillLevel = 0;
            this._bFillLevelAnimActive = false;
            this._iFillLevelAnimFrame = null;
            this._bStatusEffectsActive = false;
            this._iStatusEffectsFrame = null;
            this._sTankStatusCode = "E";
            this._bAssemblyActive = false;
            this._bAssemblyReverse = false;
            this._iAssemblyFrame = null;
            this._bAssemblyInGap = false;
            this._bAssemblyPhasePrimed = false;

            var oDetailModel = new JSONModel({
                busy: false,
                headerTitle: "탱크 상세",
                tankId: "",
                tankName: "",
                plantLabel: "",
                plantName: "",
                areaLabel: "",
                capacity: 0,
                currentInventory: 0,
                availableStock: 0,
                level: 0,
                levelText: "0.0%",
                levelState: "None",
                statusCode: "E",
                statusText: "빈 탱크",
                statusState: "None",
                statusIcon: "sap-icon://circle-task-2",
                statusColor: "#B8BDC3",
                stockWerks: "-",
                stockLgort: "-",
                stockMatnr: "-",
                stockBatchId: "-",
                stockQuantity: 0,
                stockQty15: 0,
                stockLabst: 0,
                stockPickQ: 0,
                stockTempText: "-",
                stockApiGText: "-",
                stockApiG: 0,
                stockSulfCText: "-",
                stockSalk3: 0,
                stockWaers: "",
                hasStockRecord: false,
                countUser: "-",
                countDate: "-",
                countTime: "-",
                measurement: {
                    measuredQuantity: "",
                    temperature: "",
                    calculatedQuantity: "",
                    formulaVisible: false,
                    formulaText: ""
                },
                interiorViewActive: false,
                shellPeelBusy: false,
                viewportToolbarExpanded: false
            });

            this.getView().setModel(oDetailModel, "tankDetail");
            this.getOwnerComponent().getRouter()
                .getRoute("RouteTankDetail")
                .attachPatternMatched(this._onRouteMatched, this);

            registerTankModelResolver();
            this._loadInventoryMeasureDialog();
        },

        onAfterRendering: function () {
            this._initViewport();
        },

        onExit: function () {
            this._detachViewportCameraHandler();
            this._resetTankViewportState(true);
            this._bViewportReady = false;
            this._fnCameraChanged = null;
            this._oViewport = null;
            this._oContentConnector = null;
            this._oDrawerToolbar = null;

            if (this._oInventoryMeasureDialog) {
                this._oInventoryMeasureDialog.destroy();
                this._oInventoryMeasureDialog = null;
            }

            this._bInventoryMeasureDialogLoaded = false;
        },

        _detachViewportCameraHandler: function () {
            if (!this._fnCameraChanged) {
                return;
            }

            var oImpl = this._getViewportImplementation();

            if (oImpl && oImpl.detachCameraChanged) {
                oImpl.detachCameraChanged(this._fnCameraChanged);
            }
        },

        _attachViewportCameraHandler: function () {
            if (this._fnCameraChanged) {
                return;
            }

            this._fnCameraChanged = function () {
                if (this._bLiquidAnimActive) {
                    this._applyCameraSloshImpulse(0.02);
                    this._forceViewportRedraw();
                }
            }.bind(this);

            var oImpl = this._getViewportImplementation();

            if (oImpl && oImpl.attachCameraChanged) {
                oImpl.attachCameraChanged(this._fnCameraChanged);
            }
        },

        _initViewport: function () {
            if (this._bViewportReady) {
                return;
            }

            var oView = this.getView();
            var oViewport = oView.byId("tankViewport");

            if (!oViewport) {
                return;
            }

            this._oViewport = oViewport;
            this._vPrevCamDir = null;
            this._vPrevCamPos = null;
            this._fPrevLiquidTick = 0;
            this._initSloshModes();

            var oRotateOrbitTool = new RotateOrbitTool();
            oViewport.addTool(oRotateOrbitTool);
            this._oRotateOrbitTool = oRotateOrbitTool;

            this._oDrawerToolbar = new DrawerToolbar({
                expanded: false,
                viewport: oViewport
            });
            oViewport.addContent(this._oDrawerToolbar);

            var oSceneOrientationTool = new SceneOrientationTool({
                enablePredefinedViews: true,
                enableInitialView: false
            });
            oViewport.addTool(oSceneOrientationTool);
            this._oSceneOrientationTool = oSceneOrientationTool;

            var oContentConnector = new ContentConnector({
                contentChangesFinished: function (oEvent) {
                    var oContent = oEvent.getParameter("content");

                    if (oContent === null) {
                        this._oTankSceneContent = null;
                        return;
                    }

                    oRotateOrbitTool.setActive(true, oViewport);
                    oSceneOrientationTool.setActive(true, oViewport);
                    this._bInteriorViewActive = false;
                    this.getView().getModel("tankDetail").setProperty("/interiorViewActive", false);
                    this._oTankSceneContent = oContent;

                    var fTargetFill = oTankSceneConfigStore.fillLevel || 0;
                    this._fBaselineFillLevel = fTargetFill;
                    this._fCurrentDisplayFillLevel = 0;
                    var oTankGroup = this._resolveTankGroup(oContent);

                    if (oTankGroup) {
                        this._focusTankViewport(oViewport, oContent);
                        this._playTankAssembly(oTankGroup, function () {
                            this._bindTankViewportEvents(oViewport, oContent);
                            this._startLiquidAnimation(oContent);
                            this._applyTankStatusEffects(oTankGroup);
                        }.bind(this));
                    } else {
                        this._focusTankViewport(oViewport, oContent);
                    }
                }.bind(this)
            });

            var oViewStateManager = new ViewStateManager({
                contentConnector: oContentConnector
            });

            oViewport.setContentConnector(oContentConnector);
            oViewport.setViewStateManager(oViewStateManager);
            oView.addDependent(oContentConnector);
            oView.addDependent(oViewStateManager);

            this._oContentConnector = oContentConnector;
            this._bViewportReady = true;
            this._attachViewportCameraHandler();

            if (this._sWerks && this._sLgort) {
                this._loadTankModel();
            }
        },

        _resetTankViewportState: function (bDestroyContent) {
            this._stopShellPeelAnimation();
            this._stopTankAssembly();
            this._stopFillLevelAnimation();
            this._stopStatusEffects();
            this._bMeasurePreviewActive = false;
            this._stopLiquidAnimation();
            this._resetSloshState();
            this._unbindTankViewportEvents();
            this._bInteriorViewActive = false;

            var oTankGroup = this._resolveTankGroup(this._oTankSceneContent);
            if (oTankGroup) {
                this._setTankShellVisible(oTankGroup, true);
            }

            this._oTankSceneContent = null;

            oTankSceneConfigStore = {
                fillLevel: 0,
                fillColor: hexToNumber("#B8BDC3"),
                shellColor: 0xB8BFC6
            };

            var oDetailModel = this.getView().getModel("tankDetail");

            if (oDetailModel) {
                oDetailModel.setProperty("/interiorViewActive", false);
                oDetailModel.setProperty("/shellPeelBusy", false);
            }

            if (bDestroyContent && this._oContentConnector) {
                this._oContentConnector.destroyAggregation("contentResources");
            }
        },

        _resolveLiquidFillGroup: function (oContent) {
            var oTankGroup = this._resolveTankGroup(oContent);

            return oTankGroup ? oTankGroup.getObjectByName("InventoryFill") : null;
        },

        _resolveLiquidSurfaceMaterial: function (oContent) {
            var oFillGroup = this._resolveLiquidFillGroup(oContent);

            if (!oFillGroup) {
                return null;
            }

            if (oFillGroup.userData.liquidSurfaceMaterial) {
                return oFillGroup.userData.liquidSurfaceMaterial;
            }

            var oSurface = oFillGroup.getObjectByName("InventoryFillSurface");

            return oSurface && oSurface.material ? oSurface.material : null;
        },

        _getNativeThreeCamera: function () {
            var oViewport = this._oViewport;

            if (!oViewport) {
                return null;
            }

            var oCamera = oViewport.getCamera && oViewport.getCamera();

            if (oCamera && oCamera.getCameraRef) {
                return oCamera.getCameraRef();
            }

            var oImplementation = oViewport.getImplementation && oViewport.getImplementation();

            if (oImplementation && oImplementation._getNativeCamera) {
                return oImplementation._getNativeCamera();
            }

            return null;
        },

        _initSloshModes: function () {
            this._aSloshModes = [
                { amp: 0, vel: 0, omega: 0.72, zeta: 0.32, max: 0.1 },
                { amp: 0, vel: 0, omega: 0.82, zeta: 0.32, max: 0.1 },
                { amp: 0, vel: 0, omega: 1.15, zeta: 0.38, max: 0.045 },
                { amp: 0, vel: 0, omega: 1.45, zeta: 0.42, max: 0.035 }
            ];
            this._fSloshPhase = 0;
        },

        _kickLiquidSlosh: function (fStrength) {
            if (!this._aSloshModes) {
                return;
            }

            var fKick = fStrength || 0.12;
            this._aSloshModes[0].vel += fKick;
            this._aSloshModes[1].vel += fKick * 0.82;
            this._aSloshModes[2].vel += fKick * 0.48;
            this._aSloshModes[3].vel += fKick * 0.36;
            this._forceViewportRedraw();
        },

        _getViewportImplementation: function () {
            var oViewport = this._oViewport;

            if (!oViewport) {
                return null;
            }

            return oViewport.getImplementation ? oViewport.getImplementation() : oViewport;
        },

        _markViewportFrame: function () {
            try {
                var oViewport = this._oViewport;

                if (oViewport && oViewport.setShouldRenderFrame) {
                    oViewport.setShouldRenderFrame(true);
                }
            } catch (oError) {
                // Viewport may not be fully initialized yet during navigation.
            }
        },

        _forceViewportRedraw: function () {
            try {
                this._markViewportFrame();

                var oImpl = this._getViewportImplementation();

                if (oImpl && oImpl._startRenderLoop) {
                    oImpl._startRenderLoop();
                }
            } catch (oError) {
                // Viewport may not be fully initialized yet during navigation.
            }
        },

        _resetSloshState: function () {
            this._initSloshModes();
            this._vPrevCamDir = null;
            this._vPrevCamPos = null;
            this._fPrevLiquidTick = 0;
            this._oLiquidFillGroup = null;
            this._oLiquidSurfaceMesh = null;
            this._oLiquidBodyMesh = null;
        },

        _clampSlosh: function (fValue, fMax) {
            return Math.max(-fMax, Math.min(fMax, fValue));
        },

        _stepSloshMode: function (oMode, fDeltaSeconds) {
            var fOmega2 = oMode.omega * oMode.omega;
            oMode.vel += -fOmega2 * oMode.amp * fDeltaSeconds;
            oMode.vel *= Math.exp(-oMode.zeta * fDeltaSeconds);
            oMode.amp += oMode.vel * fDeltaSeconds;
            oMode.amp = this._clampSlosh(oMode.amp, oMode.max);
        },

        _applyCameraSloshImpulse: function (fDeltaSeconds) {
            var oThreeCamera = this._getNativeThreeCamera();
            var oTankGroup = this._oTankSceneContent && this._resolveTankGroup(this._oTankSceneContent);

            if (!oThreeCamera || !oTankGroup) {
                return;
            }

            oTankGroup.updateMatrixWorld(true);
            var vTankCenter = new THREE.Vector3();
            oTankGroup.getWorldPosition(vTankCenter);

            var vCamDir = new THREE.Vector3()
                .subVectors(oThreeCamera.position, vTankCenter)
                .normalize();

            if (this._aSloshModes) {
                var vCamPos = oThreeCamera.position.clone();
                var fImpulseScale = this._bInteriorViewActive ? 3.2 : 1.6;
                var fDtFactor = Math.max(fDeltaSeconds, 0.008) / 0.016;

                if (this._vPrevCamPos) {
                    var vPosDelta = new THREE.Vector3().subVectors(vCamPos, this._vPrevCamPos);
                    var fImpulse = fImpulseScale * fDtFactor;

                    this._aSloshModes[0].vel += vPosDelta.x * fImpulse;
                    this._aSloshModes[1].vel += vPosDelta.z * fImpulse;
                    this._aSloshModes[2].vel += (vPosDelta.x - vPosDelta.z) * fImpulse * 0.62;
                    this._aSloshModes[3].vel += (vPosDelta.x + vPosDelta.z) * fImpulse * 0.5;
                }

                if (this._vPrevCamDir) {
                    var vDirDelta = new THREE.Vector3().subVectors(vCamDir, this._vPrevCamDir);
                    var fDirImpulse = fImpulseScale * 0.35 * fDtFactor;

                    this._aSloshModes[0].vel += vDirDelta.x * fDirImpulse;
                    this._aSloshModes[1].vel += vDirDelta.z * fDirImpulse;
                }

                this._vPrevCamPos = vCamPos;
            }

            this._vPrevCamDir = vCamDir.clone();
        },

        _updateLiquidSlosh: function (fDeltaSeconds) {
            var fDt = Math.min(Math.max(fDeltaSeconds, 0.001), 0.05);
            var oModes = this._aSloshModes;
            var oUniforms = this._oLiquidSurfaceMaterial && this._oLiquidSurfaceMaterial.uniforms;

            if (!oModes || !oUniforms) {
                return;
            }

            this._applyCameraSloshImpulse(fDt);

            if (this._bInteriorViewActive) {
                oModes[0].max = 0.12;
                oModes[1].max = 0.12;
            } else {
                oModes[0].max = 0.08;
                oModes[1].max = 0.08;
            }

            var fIdleAgitation = this._bInteriorViewActive ? 0.0025 : 0.0012;
            oModes[0].vel += Math.sin(this._fSloshPhase * 0.26) * fIdleAgitation;
            oModes[1].vel += Math.cos(this._fSloshPhase * 0.32) * fIdleAgitation;
            oModes[2].vel += Math.sin(this._fSloshPhase * 0.28) * fIdleAgitation * 0.7;
            oModes[3].vel += Math.cos(this._fSloshPhase * 0.38) * fIdleAgitation * 0.7;

            if (oUniforms.uAmbientSlosh) {
                oUniforms.uAmbientSlosh.value = this._bInteriorViewActive ? 0.03 : 0.018;
            }
            if (oUniforms.uWaveHeight) {
                oUniforms.uWaveHeight.value = this._bInteriorViewActive ? 0.034 : 0.024;
            }
            if (oUniforms.uMaxWaveHeight) {
                oUniforms.uMaxWaveHeight.value = this._bInteriorViewActive ? 0.048 : 0.036;
            }

            oModes.forEach(function (oMode) {
                this._stepSloshMode(oMode, fDt);
            }.bind(this));

            this._fSloshPhase += (
                Math.abs(oModes[0].vel) + Math.abs(oModes[1].vel)
                + Math.abs(oModes[2].vel) * 0.5
            ) * fDt * 0.32;

            if (oUniforms.uSloshAmp) {
                oUniforms.uSloshAmp.value.set(oModes[0].amp, oModes[1].amp);
            }
            if (oUniforms.uSloshChop) {
                oUniforms.uSloshChop.value.set(oModes[2].amp, oModes[3].amp);
            }
            if (oUniforms.uSloshFlow) {
                oUniforms.uSloshFlow.value.set(
                    oModes[0].vel * 0.07 + oModes[2].vel * 0.025,
                    oModes[1].vel * 0.07 + oModes[3].vel * 0.025
                );
            }
            if (oUniforms.uSloshPhase) {
                oUniforms.uSloshPhase.value = this._fSloshPhase;
            }
        },

        _startLiquidAnimation: function (oContent) {
            this._stopLiquidAnimation();
            this._resetSloshState();

            var oFillGroup = this._resolveLiquidFillGroup(oContent);
            var oSurfaceMaterial = this._resolveLiquidSurfaceMaterial(oContent);

            if (!oFillGroup || !oSurfaceMaterial || !oSurfaceMaterial.uniforms || !oSurfaceMaterial.uniforms.uTime) {
                return;
            }

            this._oLiquidFillGroup = oFillGroup;
            this._oLiquidSurfaceMesh = oFillGroup.getObjectByName("InventoryFillSurface");
            this._oLiquidBodyMesh = oFillGroup.getObjectByName("InventoryFillBody");
            this._oLiquidSurfaceMaterial = oSurfaceMaterial;
            this._bLiquidAnimActive = true;
            this._fLiquidAnimStart = performance.now();
            this._fPrevLiquidTick = this._fLiquidAnimStart;

            if (!this._fnTickLiquidAnimation) {
                this._fnTickLiquidAnimation = this._tickLiquidAnimation.bind(this);
            }

            this._kickLiquidSlosh(0.08);
            this._fnTickLiquidAnimation();
        },

        _tickLiquidAnimation: function () {
            if (!this._bLiquidAnimActive || !this._oLiquidSurfaceMaterial) {
                return;
            }

            var fNow = performance.now();
            var fDeltaSeconds = (fNow - (this._fPrevLiquidTick || fNow)) * 0.001;
            this._fPrevLiquidTick = fNow;

            var fElapsed = (fNow - this._fLiquidAnimStart) * 0.001 * 0.24;
            this._oLiquidSurfaceMaterial.uniforms.uTime.value = fElapsed;
            this._updateLiquidSlosh(fDeltaSeconds);

            if (this._bShellPeelAnimActive) {
                this._stepShellPeelAnimation(fNow);
            }

            this._forceViewportRedraw();

            this._iLiquidAnimFrame = window.requestAnimationFrame(this._fnTickLiquidAnimation);
        },

        _stopLiquidAnimation: function () {
            this._bLiquidAnimActive = false;
            this._oLiquidSurfaceMaterial = null;

            if (this._iLiquidAnimFrame) {
                window.cancelAnimationFrame(this._iLiquidAnimFrame);
                this._iLiquidAnimFrame = null;
            }
        },

        _bindTankViewportEvents: function (oViewport, oContent) {
            this._unbindTankViewportEvents();
            this._oTankSceneContent = oContent;

            var oDomRef = oViewport && oViewport.getDomRef();

            if (!oDomRef) {
                return;
            }

            var oTankGroup = this._resolveTankGroup(oContent);

            if (oTankGroup) {
                this._cacheOriginalMaterials(oTankGroup);
                this._applyExteriorView(oTankGroup);
            }

            this._fnViewportDblClick = function (oEvent) {
                this._onViewportDoubleClick(oEvent, oViewport);
            }.bind(this);

            oDomRef.addEventListener("dblclick", this._fnViewportDblClick, true);
        },

        _unbindTankViewportEvents: function () {
            if (this._oViewport && this._fnViewportDblClick) {
                var oDomRef = this._oViewport.getDomRef();

                if (oDomRef) {
                    oDomRef.removeEventListener("dblclick", this._fnViewportDblClick, true);
                }
            }

            this._fnViewportDblClick = null;
        },

        _resolveTankGroup: function (oContent) {
            var oSceneRef = oContent && oContent.getSceneRef && oContent.getSceneRef();

            if (!oSceneRef) {
                return null;
            }

            return oSceneRef.getObjectByName("StorageTank");
        },

        _updateLevelGaugeFloat: function (oTankGroup, fLevel) {
            var oGaugeGroup = oTankGroup && oTankGroup.getObjectByName("BoardLevelGauge");

            if (!oGaugeGroup) {
                return;
            }

            var oFloat = oGaugeGroup.getObjectByName("LevelGaugeFloat");
            var m = oTankGroup.userData.tankMetrics;

            if (!oFloat || !m) {
                return;
            }

            var fGaugeSpan = m.shellHeight * 0.31;
            var fClamped = Math.max(0, Math.min(fLevel, 1));

            oFloat.position.y = -fGaugeSpan + fGaugeSpan * 2 * fClamped;

            var oGaugeLiquid = oGaugeGroup.getObjectByName("LevelGaugeLiquid");
            var fLiquidSpan = oGaugeGroup.userData.gaugeLiquidSpan || fGaugeSpan * 2;
            var fLiquidBottom = typeof oGaugeGroup.userData.gaugeLiquidBottom === "number"
                ? oGaugeGroup.userData.gaugeLiquidBottom
                : -fGaugeSpan;

            if (oGaugeLiquid) {
                var fLiquidHeight = Math.max(0.008, fLiquidSpan * fClamped);

                oGaugeLiquid.scale.y = fLiquidHeight / 0.01;
                oGaugeLiquid.position.y = fLiquidBottom + fLiquidHeight / 2;
                oGaugeLiquid.visible = fClamped > 0.001;

                if (oGaugeLiquid.material && oGaugeLiquid.material.color) {
                    oGaugeLiquid.material.color.setHex(oTankSceneConfigStore.fillColor || 0x2E7D32);
                }
            }
        },

        _applyFillLevelToTank: function (oTankGroup, fLevel, bSkipRedraw) {
            if (!oTankGroup || !oTankGroup.userData.tankMetrics) {
                return;
            }

            var m = oTankGroup.userData.tankMetrics;
            var fShellHeight = m.shellHeight;
            var fFillFloorY = m.fillFloorY || (m.baseY + TANK_FILL_FLOOR_OFFSET);
            var fUsableShellHeight = m.usableShellHeight || (m.shellHeight - TANK_FILL_FLOOR_OFFSET);
            var fRadius = m.radius;
            var fClamped = Math.max(0, Math.min(fLevel, 1));
            var iFillColor = oTankSceneConfigStore.fillColor || 0x2E7D32;
            var oFillGroup = oTankGroup.getObjectByName("InventoryFill");

            if (fClamped <= 0.001) {
                if (oFillGroup) {
                    oFillGroup.visible = false;
                }

                this._updateLevelGaugeFloat(oTankGroup, 0);
                this._fCurrentDisplayFillLevel = 0;

                if (!bSkipRedraw) {
                    this._forceViewportRedraw();
                }

                return;
            }

            var fFillHeight = fUsableShellHeight * fClamped;
            var fBodyHeight = fFillHeight > 0.001
                ? Math.max(fFillHeight - 0.06, fFillHeight * 0.96)
                : 0;
            var bFillJustCreated = false;

            if (!oFillGroup) {
                oFillGroup = createInventoryFill(THREE, fRadius, fUsableShellHeight, fFillFloorY, iFillColor, fClamped);
                oTankGroup.add(oFillGroup);
                oFillGroup.visible = true;
                bFillJustCreated = true;

                if (this._oTankSceneContent) {
                    this._refreshLiquidAnimationRefs(this._oTankSceneContent);
                }
            } else {
                oFillGroup.visible = true;
                updateInventoryFillLevel(oFillGroup, THREE, fRadius, fUsableShellHeight, fFillFloorY, fClamped);
            }

            this._updateLevelGaugeFloat(oTankGroup, fClamped);
            this._fCurrentDisplayFillLevel = fClamped;

            if (bFillJustCreated && fClamped > 0.001 && !this._bInteriorViewActive) {
                this._applyExteriorView(oTankGroup);
            }

            if (fClamped > 0.001) {
                var sStatus = (oTankGroup.userData.statusCode || this._sTankStatusCode || "E").toUpperCase();

                if (sStatus === "P") {
                    ensureQualityPendingPulseRing(oTankGroup, THREE);
                    this._prepareStatusEffectNodes(oTankGroup, "P");
                }
            }

            if (!bSkipRedraw) {
                this._forceViewportRedraw();
            }
        },

        _refreshLiquidAnimationRefs: function (oContent) {
            var oFillGroup = this._resolveLiquidFillGroup(oContent);
            var oSurfaceMaterial = this._resolveLiquidSurfaceMaterial(oContent);

            if (!oFillGroup || !oSurfaceMaterial || !oSurfaceMaterial.uniforms || !oSurfaceMaterial.uniforms.uTime) {
                return;
            }

            this._oLiquidFillGroup = oFillGroup;
            this._oLiquidSurfaceMesh = oFillGroup.getObjectByName("InventoryFillSurface");
            this._oLiquidBodyMesh = oFillGroup.getObjectByName("InventoryFillBody");
            this._oLiquidSurfaceMaterial = oSurfaceMaterial;

            if (!this._bLiquidAnimActive) {
                this._bLiquidAnimActive = true;
                this._fLiquidAnimStart = performance.now();
                this._fPrevLiquidTick = this._fLiquidAnimStart;

                if (!this._fnTickLiquidAnimation) {
                    this._fnTickLiquidAnimation = this._tickLiquidAnimation.bind(this);
                }

                this._kickLiquidSlosh(0.05);
                this._fnTickLiquidAnimation();
            }
        },

        _stopFillLevelAnimation: function () {
            this._bFillLevelAnimActive = false;

            if (this._iFillLevelAnimFrame) {
                window.cancelAnimationFrame(this._iFillLevelAnimFrame);
                this._iFillLevelAnimFrame = null;
            }
        },

        _animateTankFillLevel: function (fTargetLevel, iDurationMs) {
            this._stopFillLevelAnimation();

            var oTank = this._oTankSceneContent && this._resolveTankGroup(this._oTankSceneContent);

            if (!oTank) {
                return;
            }

            this._fFillAnimFrom = this._fCurrentDisplayFillLevel || 0;
            this._fFillAnimTo = Math.max(0, Math.min(fTargetLevel, 1));
            this._fFillAnimStart = performance.now();
            this._fFillAnimDuration = iDurationMs || 900;
            this._bFillLevelAnimActive = true;

            if (!this._fnTickFillLevelAnimation) {
                this._fnTickFillLevelAnimation = this._tickFillLevelAnimation.bind(this);
            }

            this._fnTickFillLevelAnimation();
        },

        _tickFillLevelAnimation: function () {
            if (!this._bFillLevelAnimActive) {
                return;
            }

            var fNow = performance.now();
            var fProgress = Math.min((fNow - this._fFillAnimStart) / this._fFillAnimDuration, 1);
            var fEased = 1 - Math.pow(1 - fProgress, 3);
            var fLevel = this._fFillAnimFrom + (this._fFillAnimTo - this._fFillAnimFrom) * fEased;
            var oTank = this._oTankSceneContent && this._resolveTankGroup(this._oTankSceneContent);

            if (oTank) {
                this._applyFillLevelToTank(oTank, fLevel, true);
            }

            if (fProgress >= 1) {
                this._bFillLevelAnimActive = false;
                this._iFillLevelAnimFrame = null;

                if (oTank) {
                    this._kickLiquidSlosh(0.06);

                    if (this._sTankStatusCode === "P") {
                        this._prepareStatusEffectNodes(oTank, "P");
                    }
                }

                this._forceViewportRedraw();
                return;
            }

            this._forceViewportRedraw();
            this._iFillLevelAnimFrame = window.requestAnimationFrame(this._fnTickFillLevelAnimation);
        },

        _quantityToFillLevel: function (fQuantity) {
            var fCapacity = parseFloat(this.getView().getModel("tankDetail").getProperty("/capacity")) || 0;

            if (fCapacity <= 0 || isNaN(fQuantity)) {
                return 0;
            }

            return Math.max(0, Math.min(fQuantity / fCapacity, 1));
        },

        _syncMeasurementPreview3D: function () {
            if (!this._bMeasurePreviewActive || !this._oTankSceneContent) {
                return;
            }

            var oDetailModel = this.getView().getModel("tankDetail");
            var fQty = parseFloat(oDetailModel.getProperty("/measurement/calculatedQuantity"));

            if (isNaN(fQty)) {
                fQty = parseFloat(oDetailModel.getProperty("/measurement/measuredQuantity"));
            }

            var fLevel = this._quantityToFillLevel(fQty);
            var oTank = this._resolveTankGroup(this._oTankSceneContent);

            if (oTank) {
                this._stopFillLevelAnimation();
                this._applyFillLevelToTank(oTank, fLevel);
                this._kickLiquidSlosh(0.03);
            }
        },

        _endMeasurePreview3D: function () {
            if (!this._bMeasurePreviewActive) {
                return;
            }

            this._bMeasurePreviewActive = false;
            this._stopFillLevelAnimation();

            if (this._oTankSceneContent) {
                var oTank = this._resolveTankGroup(this._oTankSceneContent);

                if (oTank) {
                    this._animateTankFillLevel(this._fBaselineFillLevel, 500);
                }
            }
        },

        _cacheOriginalMaterials: function (oGroup) {
            oGroup.traverse(function (oChild) {
                if (!oChild.isMesh || !oChild.material) {
                    return;
                }

                var oMat = oChild.material;

                oChild.userData._origMaterial = {
                    transparent: oMat.transparent,
                    opacity: oMat.opacity,
                    depthWrite: oMat.depthWrite,
                    emissive: oMat.emissive ? oMat.emissive.getHex() : null
                };
            });
        },

        _isTankInteractivePart: function (oObject) {
            var oNode = oObject;
            while (oNode) {
                if (oNode.name === "StorageTank" || TANK_INTERACT_PARTS[oNode.name]) {
                    return true;
                }
                oNode = oNode.parent;
            }

            return false;
        },

        _getViewportHitCoords: function (oEvent, oViewport) {
            var oDomRef = oViewport.getDomRef();
            var oCanvas = oDomRef && oDomRef.querySelector("canvas");

            if (!oCanvas) {
                return null;
            }

            if (oEvent.target === oCanvas) {
                return {
                    x: oEvent.offsetX,
                    y: oEvent.offsetY
                };
            }

            var oRect = oCanvas.getBoundingClientRect();

            return {
                x: oEvent.clientX - oRect.left,
                y: oEvent.clientY - oRect.top
            };
        },

        _onViewportDoubleClick: function (oEvent, oViewport) {
            var oCoords = this._getViewportHitCoords(oEvent, oViewport);
            var bHitTank = false;

            if (oCoords) {
                var oHit = oViewport.hitTest(oCoords.x, oCoords.y);
                bHitTank = !!(oHit && oHit.object && this._isTankInteractivePart(oHit.object));
            }

            if (!bHitTank) {
                return;
            }

            oEvent.preventDefault();
            oEvent.stopPropagation();

            if (this._bShellPeelAnimActive) {
                return;
            }

            this._toggleInteriorView(oViewport);
        },

        onToggleViewportToolbar: function () {
            if (!this._oDrawerToolbar) {
                return;
            }

            var bExpanded = !this._oDrawerToolbar.getExpanded();
            this._oDrawerToolbar.setExpanded(bExpanded);
            this.getView().getModel("tankDetail").setProperty("/viewportToolbarExpanded", bExpanded);
            this._forceViewportRedraw();
        },

        onToggleInteriorViewPress: function () {
            if (!this._oViewport || this._bShellPeelAnimActive) {
                return;
            }

            this._toggleInteriorView(this._oViewport);
        },

        _cancelShellPeelAnimation: function () {
            if (this._iShellPeelFrame) {
                window.cancelAnimationFrame(this._iShellPeelFrame);
                this._iShellPeelFrame = null;
            }

            this._bShellPeelAnimActive = false;
            this._fnShellPeelComplete = null;
            this._oShellPeelShell = null;
        },

        _prepareShellLiftRig: function (oShell, oTankGroup) {
            var m = oTankGroup.userData.tankMetrics;
            var fShellHeight = m ? m.shellHeight : 6.2;
            var fBaseY = m ? m.baseY : 0.65;

            if (!oShell.userData._shellBasePos) {
                oShell.userData._shellBasePos = oShell.position.clone();
                oShell.userData._shellBaseScale = oShell.scale.clone();
            }

            oShell.userData._shellBasePos.x = oShell.position.x;
            oShell.userData._shellBasePos.y = fBaseY + fShellHeight / 2;
            oShell.userData._shellBasePos.z = oShell.position.z;
            oShell.userData._shellLiftHeight = fShellHeight * 0.95 + 0.85;
        },

        _applyShellLiftProgress: function (oShell, fLiftT, bFinalize) {
            var oBasePos = oShell.userData._shellBasePos;
            var oBaseScale = oShell.userData._shellBaseScale;
            var fLift = oShell.userData._shellLiftHeight || 6.5;

            if (!oBasePos || !oBaseScale) {
                return;
            }

            if (bFinalize) {
                oShell.position.copy(oBasePos);
                oShell.scale.copy(oBaseScale);
                oShell.updateMatrix();
                return;
            }

            var fClamped = Math.max(0, Math.min(fLiftT, 1));

            oShell.position.copy(oBasePos);
            oShell.position.y += fLift * fClamped;
            oShell.scale.copy(oBaseScale);
            oShell.updateMatrix();
        },

        _finishShellPeelAnimation: function () {
            this._cancelShellPeelAnimation();

            var oDetailModel = this.getView().getModel("tankDetail");

            if (oDetailModel) {
                oDetailModel.setProperty("/shellPeelBusy", false);
            }
        },

        _stopShellPeelAnimation: function () {
            var oShell = this._oShellPeelShell;

            if (!oShell) {
                var oTankGroup = this._resolveTankGroup(this._oTankSceneContent);
                oShell = oTankGroup && oTankGroup.getObjectByName("TankShell");
            }

            if (oShell && oShell.userData._shellBasePos) {
                if (this._bInteriorViewActive) {
                    this._applyShellLiftProgress(oShell, 1, false);
                    oShell.visible = false;
                } else {
                    this._applyShellLiftProgress(oShell, 0, true);
                    oShell.visible = true;
                }
            } else if (oShell) {
                oShell.visible = !this._bInteriorViewActive;
            }

            this._cancelShellPeelAnimation();

            var oDetailModel = this.getView().getModel("tankDetail");

            if (oDetailModel) {
                oDetailModel.setProperty("/shellPeelBusy", false);
            }
        },

        _stepShellPeelAnimation: function (fNow) {
            if (!this._bShellPeelAnimActive) {
                return true;
            }

            var oShell = this._oShellPeelShell;

            if (!oShell) {
                var fnMissing = this._fnShellPeelComplete;
                this._finishShellPeelAnimation();

                if (fnMissing) {
                    fnMissing();
                }

                return true;
            }

            var fElapsed = fNow - this._fShellPeelStart;
            var fProgress = Math.min(fElapsed / TANK_SHELL_PEEL_DURATION_MS, 1);
            var fEased = easeInOutCubic(fProgress);
            var fLiftT = this._bShellPeelDressing ? (1 - fEased) : fEased;

            oShell.visible = true;
            this._applyShellLiftProgress(oShell, fLiftT, false);

            if (fProgress < 1) {
                return false;
            }

            if (this._bShellPeelDressing) {
                this._applyShellLiftProgress(oShell, 0, true);
                oShell.visible = true;
            } else {
                this._applyShellLiftProgress(oShell, 1, false);
                oShell.visible = false;
            }

            var fnComplete = this._fnShellPeelComplete;
            this._finishShellPeelAnimation();

            if (fnComplete) {
                fnComplete();
            }

            return true;
        },

        _tickShellPeelAnimation: function () {
            if (!this._bShellPeelAnimActive) {
                return;
            }

            var bDone = this._stepShellPeelAnimation(performance.now());

            if (bDone) {
                this._markViewportFrame();
                return;
            }

            this._markViewportFrame();
            this._iShellPeelFrame = window.requestAnimationFrame(this._fnTickShellPeel);
        },

        _runTankShellPeelAnimation: function (oTankGroup, bDressing, fnOnComplete) {
            var oShell = oTankGroup.getObjectByName("TankShell");

            if (!oShell) {
                if (fnOnComplete) {
                    fnOnComplete();
                }

                return;
            }

            this._cancelShellPeelAnimation();
            this._prepareShellLiftRig(oShell, oTankGroup);
            this._oShellPeelShell = oShell;
            this._bShellPeelAnimActive = true;
            this._bShellPeelDressing = bDressing;
            this._fnShellPeelComplete = fnOnComplete;
            this._fShellPeelStart = performance.now();

            var oDetailModel = this.getView().getModel("tankDetail");

            if (oDetailModel) {
                oDetailModel.setProperty("/shellPeelBusy", true);
            }

            if (bDressing) {
                oShell.visible = true;
                this._applyShellLiftProgress(oShell, 1, false);
            } else {
                oShell.visible = true;
                this._applyShellLiftProgress(oShell, 0, false);
            }

            if (!this._fnTickShellPeel) {
                this._fnTickShellPeel = this._tickShellPeelAnimation.bind(this);
            }

            if (this._bLiquidAnimActive) {
                this._stepShellPeelAnimation(this._fShellPeelStart);
                return;
            }

            this._forceViewportRedraw();
            this._fnTickShellPeel();
        },

        _setTankShellVisible: function (oTankGroup, bVisible) {
            var oShell = oTankGroup && oTankGroup.getObjectByName("TankShell");

            if (oShell) {
                oShell.visible = bVisible;
            }
        },

        _applyShellStrippedView: function (oTankGroup) {
            oTankGroup.traverse(function (oChild) {
                if (!oChild.isMesh || !oChild.material) {
                    return;
                }

                var oMat = oChild.material;
                var sName = oChild.name;

                if (oChild.userData.wireCageWire) {
                    oMat.transparent = false;
                    oMat.opacity = 1;
                    oMat.depthWrite = true;
                    oMat.metalness = 0.84;
                    oMat.roughness = 0.34;
                    oChild.renderOrder = 2;
                } else if (sName === "ConicalRoof" || sName === "RoofDeck") {
                    oMat.transparent = true;
                    oMat.opacity = 0.15;
                    oMat.depthWrite = false;
                    oChild.renderOrder = 1;
                } else if (sName === "InventoryFillBody") {
                    oMat.transparent = true;
                    oMat.opacity = 0.9;
                    oMat.depthWrite = true;
                    if (oMat.emissive) {
                        oMat.emissive.setHex(0x0d0d0d);
                    }
                    oChild.renderOrder = 3;
                } else if (sName === "InventoryFillSurface") {
                    if (oMat.uniforms) {
                        if (oMat.uniforms.uWaveHeight) {
                            oMat.uniforms.uWaveHeight.value = 0.034;
                        }
                        if (oMat.uniforms.uAmbientSlosh) {
                            oMat.uniforms.uAmbientSlosh.value = 0.03;
                        }
                        if (oMat.uniforms.uMaxWaveHeight) {
                            oMat.uniforms.uMaxWaveHeight.value = 0.048;
                        }
                    }
                    oChild.renderOrder = 6;
                }
            });
        },

        _toggleInteriorView: function (oViewport) {
            var oTankGroup = this._resolveTankGroup(this._oTankSceneContent);
            var oDetailModel = this.getView().getModel("tankDetail");

            if (!oTankGroup) {
                MessageToast.show("3D 모델이 아직 준비되지 않았습니다.");
                return;
            }

            if (this._bShellPeelAnimActive) {
                return;
            }

            var bGoingInterior = !this._bInteriorViewActive;

            if (bGoingInterior) {
                this._runTankShellPeelAnimation(oTankGroup, false, function () {
                    this._bInteriorViewActive = true;
                    oDetailModel.setProperty("/interiorViewActive", true);
                    this._applyShellStrippedView(oTankGroup);

                    var oFillNode = oTankGroup.getObjectByName("InventoryFill");

                    if (oFillNode) {
                        oViewport.zoomTo([ZoomTo.Node, ZoomTo.ViewTop], oFillNode, 300, 0.42);
                        this._kickLiquidSlosh(0.14);
                        MessageToast.show(
                            "내부 노출 · " + oDetailModel.getProperty("/levelText")
                            + " · " + oDetailModel.getProperty("/currentInventory") + " BBL"
                        );
                    } else {
                        oViewport.zoomTo([ZoomTo.Node, ZoomTo.ViewFront], oTankGroup, 300, 0.35);
                        MessageToast.show("빈 탱크 — 내부 재고가 없습니다.");
                    }

                    this._forceViewportRedraw();
                }.bind(this));
                return;
            }

            this._runTankShellPeelAnimation(oTankGroup, true, function () {
                this._bInteriorViewActive = false;
                oDetailModel.setProperty("/interiorViewActive", false);
                this._restoreExteriorView(oTankGroup);
                oViewport.zoomTo([ZoomTo.Node, ZoomTo.ViewFront], oTankGroup, 300, 0.22);
                MessageToast.show("탱크 재조립완료.");
                this._forceViewportRedraw();
            }.bind(this));
        },

        _buildAssemblyPlan: function (oTankGroup) {
            var aByPhase = [];

            for (var p = 0; p <= TANK_ASSEMBLY_MAX_PHASE; p++) {
                aByPhase[p] = [];
            }

            TANK_ASSEMBLY_STEPS.forEach(function (oStep) {
                oStep.parts.forEach(function (oPart) {
                    var oNode = oTankGroup.getObjectByName(oPart.name);

                    if (oNode) {
                        aByPhase[oStep.phase].push({
                            node: oNode,
                            style: oPart.style
                        });
                    }
                });
            });

            return aByPhase;
        },

        _hideAllTankAssemblyParts: function (oTankGroup) {
            oTankGroup.traverse(function (oNode) {
                if (oNode === oTankGroup || oNode.isLight) {
                    return;
                }

                if (oNode.parent && oNode.parent.name && TANK_ASSEMBLY_MAJOR_NAMES[oNode.parent.name]) {
                    return;
                }

                if (oNode.name === "InventoryFill") {
                    oNode.visible = false;
                    return;
                }

                if (oNode.name === "InboundPipeFlow" || oNode.name === "InventoryFillEdgePulse") {
                    return;
                }

                if (oNode.parent && (oNode.parent.name === "InventoryFill" || oNode.parent.name === "InventoryFillAnchor")) {
                    return;
                }

                if (oNode.isMesh || (oNode.isGroup && oNode.name)) {
                    oNode.userData._asmDecor = !TANK_ASSEMBLY_MAJOR_NAMES[oNode.name];
                    oNode.visible = false;
                }
            });
        },

        _revealAssemblyDecorForPhase: function (oTankGroup, iPhase) {
            oTankGroup.children.forEach(function (oChild) {
                if (oChild.isLight || !oChild.userData._asmDecor) {
                    return;
                }

                if (oChild.userData.assemblyPhase === iPhase) {
                    oChild.visible = true;
                    oChild.updateMatrix();
                }
            });
        },

        _hideAssemblyDecorForPhase: function (oTankGroup, iPhase) {
            oTankGroup.children.forEach(function (oChild) {
                if (oChild.isLight || !oChild.userData._asmDecor) {
                    return;
                }

                if (oChild.userData.assemblyPhase === iPhase) {
                    oChild.visible = false;
                }
            });
        },

        _snapshotAssemblyPart: function (oPart) {
            var oNode = oPart.node;
            var sStyle = oPart.style;

            oNode.userData._asmBasePos = oNode.position.clone();
            oNode.userData._asmBaseScale = oNode.scale.clone();
            oNode.userData._asmStyle = sStyle;

            if (sStyle === "wire-cage-build") {
                if (!oNode.userData._wireBuildCount) {
                    var iCount = 0;
                    forEachWireCageWire(oNode, function () {
                        iCount++;
                    });
                    oNode.userData._wireBuildCount = iCount;
                }
                return;
            }

            if (sStyle === "seam-rise") {
                oNode.children.forEach(function (oSeam) {
                    if (!oSeam.isMesh) {
                        return;
                    }

                    oSeam.userData._asmBaseScaleY = oSeam.scale.y;
                    oSeam.userData._asmBasePosY = oSeam.position.y;
                });
                return;
            }

            oNode.userData._asmFromPos = oNode.position.clone();

            if (sStyle === "drop") {
                oNode.userData._asmFromPos.y += 3.2;
            } else if (sStyle === "rise") {
                var m = oNode.parent && oNode.parent.userData.tankMetrics;
                var fHalf = m ? m.shellHeight / 2 : 3.1;
                var fBaseY = m ? m.baseY : 0.65;
                oNode.userData._asmFromPos.y = fBaseY;
                oNode.userData._asmRiseHalf = fHalf;
            } else if (sStyle === "slide") {
                oNode.userData._asmFromPos.x += oNode.userData._asmBasePos.x >= 0 ? 4.2 : -4.2;
            } else {
                oNode.userData._asmFromPos.y -= 1.2;
            }
        },

        _prepareAssemblyPart: function (oPart) {
            var oNode = oPart.node;
            var sStyle = oPart.style;

            oNode.userData._asmBasePos = oNode.position.clone();
            oNode.userData._asmBaseScale = oNode.scale.clone();
            oNode.userData._asmStyle = sStyle;
            oNode.userData._asmStarted = false;
            oNode.visible = false;

            if (sStyle === "wire-cage-build") {
                if (!oNode.userData._wireBuildCount) {
                    var iCount = 0;
                    forEachWireCageWire(oNode, function () {
                        iCount++;
                    });
                    oNode.userData._wireBuildCount = iCount;
                }

                forEachWireCageWire(oNode, function (oWire) {
                    oWire.userData._asmBaseScale = oWire.scale.clone();
                    oWire.scale.set(0.001, 0.001, 0.001);
                    oWire.visible = false;
                });
                return;
            }

            if (sStyle === "seam-rise") {
                oNode.children.forEach(function (oSeam) {
                    if (!oSeam.isMesh) {
                        return;
                    }

                    var fHalf = oSeam.geometry && oSeam.geometry.parameters
                        ? oSeam.geometry.parameters.height / 2
                        : 3.1;

                    oSeam.userData._asmBaseScaleY = oSeam.scale.y;
                    oSeam.userData._asmBasePosY = oSeam.position.y;
                    oSeam.scale.y = 0.02;
                    oSeam.position.y = -fHalf * (1 - oSeam.scale.y);
                });
                return;
            }

            oNode.userData._asmFromPos = oNode.position.clone();

            if (sStyle === "drop") {
                oNode.userData._asmFromPos.y += 3.2;
            } else if (sStyle === "rise") {
                var m = oNode.parent && oNode.parent.userData.tankMetrics;
                var fHalf = m ? m.shellHeight / 2 : 3.1;
                var fBaseY = m ? m.baseY : 0.65;
                oNode.userData._asmFromPos.y = fBaseY;
                oNode.userData._asmRiseHalf = fHalf;
                oNode.scale.y = 0.04;
            } else if (sStyle === "slide") {
                oNode.userData._asmFromPos.x += oNode.userData._asmBasePos.x >= 0 ? 4.2 : -4.2;
            } else {
                oNode.userData._asmFromPos.y -= 1.2;
            }
        },

        _beginAssemblyPart: function (oPart) {
            var oNode = oPart.node;

            if (oNode.userData._asmStarted) {
                return;
            }

            oNode.userData._asmStarted = true;
            oNode.visible = true;

            if (oNode.userData._asmStyle === "wire-cage-build" || oNode.userData._asmStyle === "seam-rise") {
                oNode.updateMatrix();
                return;
            }

            oNode.position.copy(oNode.userData._asmFromPos);

            if (oNode.userData._asmStyle === "rise") {
                oNode.scale.y = 0.04;
            }

            oNode.updateMatrix();
        },

        _applyAssemblyPartProgress: function (oPart, fT, bFinalize) {
            var oNode = oPart.node;
            var oBasePos = oNode.userData._asmBasePos;
            var oFromPos = oNode.userData._asmFromPos;
            var oBaseScale = oNode.userData._asmBaseScale;
            var sStyle = oNode.userData._asmStyle;

            if (sStyle === "wire-cage-build") {
                var iMax = oNode.userData._wireBuildCount || 1;
                var fSpread = 0.52;

                if (bFinalize) {
                    forEachWireCageWire(oNode, function (oWire) {
                        if (oWire.userData._asmBaseScale) {
                            oWire.scale.copy(oWire.userData._asmBaseScale);
                        } else {
                            oWire.scale.set(1, 1, 1);
                        }
                        oWire.visible = true;
                    });
                    oNode.visible = true;
                    oNode.updateMatrix();
                    return;
                }

                var fEased = easeOutBackAssembly(Math.max(0, Math.min(fT, 1)));

                forEachWireCageWire(oNode, function (oWire) {
                    var iOrd = oWire.userData.wireBuildOrder || 0;
                    var fOrdIndex = this._bAssemblyReverse ? (iMax - 1 - iOrd) : iOrd;
                    var fDelay = iMax > 1 ? (fOrdIndex / (iMax - 1)) * fSpread : 0;
                    var fDenom = Math.max(0.001, 1 - fSpread);
                    var fLocalT = Math.max(0, Math.min(1, (fEased - fDelay) / fDenom));
                    var fLocalEased = easeOutBackAssembly(fLocalT);
                    var oWireBaseScale = oWire.userData._asmBaseScale;

                    oWire.visible = fLocalEased > 0.03;

                    if (oWireBaseScale) {
                        oWire.scale.set(
                            oWireBaseScale.x * fLocalEased,
                            oWireBaseScale.y * fLocalEased,
                            oWireBaseScale.z * fLocalEased
                        );
                    } else {
                        oWire.scale.setScalar(fLocalEased);
                    }
                }.bind(this));

                oNode.visible = true;
                oNode.updateMatrix();
                return;
            }

            if (sStyle === "seam-rise") {
                if (bFinalize) {
                    oNode.children.forEach(function (oSeam) {
                        if (!oSeam.isMesh) {
                            return;
                        }

                        oSeam.scale.y = typeof oSeam.userData._asmBaseScaleY === "number"
                            ? oSeam.userData._asmBaseScaleY
                            : 1;
                        oSeam.position.y = typeof oSeam.userData._asmBasePosY === "number"
                            ? oSeam.userData._asmBasePosY
                            : 0;
                    });
                    oNode.visible = true;
                    oNode.updateMatrix();
                    return;
                }

                var fEased = easeOutBackAssembly(Math.max(0, Math.min(fT, 1)));
                var iCount = oNode.children.length;
                var fStagger = iCount > 1 ? Math.min(0.4, 14 / iCount) : 0;

                oNode.children.forEach(function (oSeam, i) {
                    if (!oSeam.isMesh) {
                        return;
                    }

                    var fDelay = iCount > 1
                        ? ((this._bAssemblyReverse ? (iCount - 1 - i) : i) / (iCount - 1)) * fStagger
                        : 0;
                    var fLocalT = Math.max(0, Math.min(1, (fEased - fDelay) / (1 - fStagger)));
                    var fLocalEased = easeOutBackAssembly(fLocalT);
                    var fHalf = oSeam.geometry && oSeam.geometry.parameters
                        ? oSeam.geometry.parameters.height / 2
                        : 3.1;
                    var fBaseScaleY = typeof oSeam.userData._asmBaseScaleY === "number"
                        ? oSeam.userData._asmBaseScaleY
                        : 1;

                    oSeam.scale.y = 0.02 + (fBaseScaleY - 0.02) * fLocalEased;
                    oSeam.position.y = -fHalf * (1 - oSeam.scale.y);
                });

                oNode.visible = true;
                oNode.updateMatrix();
                return;
            }

            if (!oBasePos || !oFromPos || !oBaseScale) {
                return;
            }

            if (bFinalize) {
                oNode.position.copy(oBasePos);
                oNode.scale.copy(oBaseScale);
                oNode.visible = true;
                oNode.updateMatrix();
                return;
            }

            var fEased = easeOutBackAssembly(Math.max(0, Math.min(fT, 1)));

            if (sStyle === "rise") {
                var fHalf = oNode.userData._asmRiseHalf || 3.1;
                var fBaseY = oFromPos.y;
                oNode.scale.y = 0.04 + (oBaseScale.y - 0.04) * fEased;
                oNode.position.y = fBaseY + fHalf * fEased;
            } else {
                oNode.position.x = oFromPos.x + (oBasePos.x - oFromPos.x) * fEased;
                oNode.position.y = oFromPos.y + (oBasePos.y - oFromPos.y) * fEased;
                oNode.position.z = oFromPos.z + (oBasePos.z - oFromPos.z) * fEased;
            }

            oNode.updateMatrix();
        },

        _playTankAssembly: function (oTankGroup, fnOnComplete) {
            this._stopTankAssembly();
            this._oAssemblyTankGroup = oTankGroup;
            this._fnAssemblyComplete = fnOnComplete;
            this._aAssemblyPartsByPhase = this._buildAssemblyPlan(oTankGroup);
            this._iAssemblyPhase = 0;
            this._bAssemblyInGap = false;
            this._bAssemblyPhasePrimed = false;
            this._fAssemblyPhaseStart = performance.now();
            this._bAssemblyActive = true;
            this._bAssemblyReverse = false;

            this._fAssemblyLiquidTarget = 0;
            this._fAssemblyLiquidStart = 0;
            this._bAssemblyLiquidActive = false;

            this._hideAllTankAssemblyParts(oTankGroup);

            for (var p = 0; p < TANK_ASSEMBLY_LIQUID_PHASE; p++) {
                (this._aAssemblyPartsByPhase[p] || []).forEach(function (oPart) {
                    this._prepareAssemblyPart(oPart);
                }.bind(this));
            }

            if (!this._fnTickTankAssembly) {
                this._fnTickTankAssembly = this._tickTankAssembly.bind(this);
            }

            this._fnTickTankAssembly();
        },

        _playTankDisassembly: function (oTankGroup, fnOnComplete) {
            this._stopTankAssembly();
            this._oAssemblyTankGroup = oTankGroup;
            this._fnAssemblyComplete = fnOnComplete;
            this._aAssemblyPartsByPhase = this._buildAssemblyPlan(oTankGroup);
            this._bAssemblyReverse = true;
            this._bAssemblyActive = true;
            this._bAssemblyInGap = false;
            this._bAssemblyPhasePrimed = false;
            this._fAssemblyPhaseStart = performance.now();

            for (var p = 0; p < TANK_ASSEMBLY_LIQUID_PHASE; p++) {
                (this._aAssemblyPartsByPhase[p] || []).forEach(function (oPart) {
                    if (!oPart.node.userData._asmBasePos) {
                        this._snapshotAssemblyPart(oPart);
                    }
                }.bind(this));
            }

            var fTargetFill = oTankSceneConfigStore.fillLevel || 0;

            if (fTargetFill > 0.001) {
                this._iAssemblyPhase = TANK_ASSEMBLY_LIQUID_PHASE;
                this._fAssemblyLiquidDrainFrom = this._fCurrentDisplayFillLevel || fTargetFill;
            } else {
                this._iAssemblyPhase = TANK_ASSEMBLY_LIQUID_PHASE - 1;
            }

            if (!this._fnTickTankAssembly) {
                this._fnTickTankAssembly = this._tickTankAssembly.bind(this);
            }

            this._fnTickTankAssembly();
        },

        _primeDisassemblyPhase: function (iPhase) {
            var oTankGroup = this._oAssemblyTankGroup;

            (this._aAssemblyPartsByPhase[iPhase] || []).forEach(function (oPart) {
                oPart.node.visible = true;
                this._applyAssemblyPartProgress(oPart, 1, true);
            }.bind(this));

            if (oTankGroup) {
                this._revealAssemblyDecorForPhase(oTankGroup, iPhase);
            }
        },

        _primeAssemblyPhase: function (iPhase) {
            var oTankGroup = this._oAssemblyTankGroup;
            var oStep = TANK_ASSEMBLY_STEPS.filter(function (s) {
                return s.phase === iPhase;
            })[0];

            if (oStep && oStep.revealDecor && oTankGroup) {
                this._revealAssemblyDecorForPhase(oTankGroup, iPhase);
            }

            (this._aAssemblyPartsByPhase[iPhase] || []).forEach(function (oPart) {
                this._beginAssemblyPart(oPart);
            }.bind(this));
        },

        _primeAssemblyLiquidCharge: function () {
            var oTankGroup = this._oAssemblyTankGroup;
            var fTargetFill = oTankSceneConfigStore.fillLevel || 0;

            this._fAssemblyLiquidTarget = fTargetFill;
            this._fBaselineFillLevel = fTargetFill;
            this._fCurrentDisplayFillLevel = 0;
            this._fAssemblyLiquidStart = performance.now();
            this._bAssemblyLiquidActive = fTargetFill > 0.001;
        },

        _tickAssemblyLiquidCharge: function (fNow) {
            var oTankGroup = this._oAssemblyTankGroup;
            var fTargetFill = this._fAssemblyLiquidTarget;

            if (!oTankGroup || fTargetFill <= 0.001) {
                this._finishTankAssembly();
                return;
            }

            var fElapsed = fNow - this._fAssemblyLiquidStart;
            var fProgress = Math.min(fElapsed / TANK_ASSEMBLY_LIQUID_CHARGE_MS, 1);
            var fEased = easeOutBackAssembly(fProgress);
            var fLevel = fTargetFill * fEased;

            this._applyFillLevelToTank(oTankGroup, Math.max(fLevel, 0.004), true);
            this._updateLevelGaugeFloat(oTankGroup, fLevel);
            this._fCurrentDisplayFillLevel = fLevel;

            if (fProgress >= 1) {
                this._applyFillLevelToTank(oTankGroup, fTargetFill, true);
                this._updateLevelGaugeFloat(oTankGroup, fTargetFill);
                this._fCurrentDisplayFillLevel = fTargetFill;
                this._kickLiquidSlosh(0.08);
                this._finishTankAssembly();
                return;
            }

            this._forceViewportRedraw();
            this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
        },

        _tickAssemblyLiquidDrain: function (fNow) {
            var oTankGroup = this._oAssemblyTankGroup;
            var fDrainFrom = this._fAssemblyLiquidDrainFrom || 0;

            if (!oTankGroup || fDrainFrom <= 0.001) {
                this._iAssemblyPhase = TANK_ASSEMBLY_LIQUID_PHASE - 1;
                this._bAssemblyInGap = true;
                this._bAssemblyPhasePrimed = false;
                this._fAssemblyPhaseStart = fNow;
                this._forceViewportRedraw();
                this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
                return;
            }

            var fElapsed = fNow - this._fAssemblyLiquidStart;
            var fProgress = Math.min(fElapsed / TANK_ASSEMBLY_LIQUID_CHARGE_MS, 1);
            var fEased = easeOutBackAssembly(fProgress);
            var fLevel = fDrainFrom * (1 - fEased);

            this._applyFillLevelToTank(oTankGroup, Math.max(fLevel, 0), true);
            this._updateLevelGaugeFloat(oTankGroup, fLevel);
            this._fCurrentDisplayFillLevel = fLevel;

            if (fProgress >= 1) {
                this._applyFillLevelToTank(oTankGroup, 0, true);
                this._updateLevelGaugeFloat(oTankGroup, 0);
                this._fCurrentDisplayFillLevel = 0;

                var oFillGroup = oTankGroup.getObjectByName("InventoryFill");

                if (oFillGroup) {
                    oFillGroup.visible = false;
                }

                this._iAssemblyPhase = TANK_ASSEMBLY_LIQUID_PHASE - 1;
                this._bAssemblyInGap = true;
                this._bAssemblyPhasePrimed = false;
                this._fAssemblyPhaseStart = fNow;
                this._forceViewportRedraw();
                this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
                return;
            }

            this._forceViewportRedraw();
            this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
        },

        _tickTankAssemblyReverse: function (fNow) {
            if (this._iAssemblyPhase === TANK_ASSEMBLY_LIQUID_PHASE) {
                if (!this._bAssemblyPhasePrimed) {
                    this._fAssemblyLiquidStart = fNow;
                    this._bAssemblyPhasePrimed = true;
                }

                this._tickAssemblyLiquidDrain(fNow);
                return;
            }

            if (this._bAssemblyInGap) {
                if (fNow - this._fAssemblyPhaseStart >= TANK_ASSEMBLY_PHASE_GAP_MS) {
                    this._bAssemblyInGap = false;
                    this._bAssemblyPhasePrimed = false;
                    this._fAssemblyPhaseStart = fNow;
                } else {
                    this._forceViewportRedraw();
                    this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
                    return;
                }
            }

            if (!this._bAssemblyPhasePrimed) {
                this._primeDisassemblyPhase(this._iAssemblyPhase);
                this._bAssemblyPhasePrimed = true;
            }

            var fElapsed = fNow - this._fAssemblyPhaseStart;
            var fProgress = Math.min(fElapsed / this._getAssemblyPhaseDuration(this._iAssemblyPhase), 1);
            var aCurrent = this._aAssemblyPartsByPhase[this._iAssemblyPhase] || [];

            aCurrent.forEach(function (oPart) {
                this._applyAssemblyPartProgress(oPart, 1 - fProgress, false);
            }.bind(this));

            if (fProgress >= 1) {
                aCurrent.forEach(function (oPart) {
                    this._applyAssemblyPartProgress(oPart, 0, false);
                    oPart.node.visible = false;
                }.bind(this));

                if (this._oAssemblyTankGroup) {
                    this._hideAssemblyDecorForPhase(this._oAssemblyTankGroup, this._iAssemblyPhase);
                }

                if (this._iAssemblyPhase <= 0) {
                    this._finishTankAssembly();
                    return;
                }

                this._iAssemblyPhase--;
                this._bAssemblyInGap = true;
                this._bAssemblyPhasePrimed = false;
                this._fAssemblyPhaseStart = fNow;
            }

            this._forceViewportRedraw();
            this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
        },

        _getAssemblyPhaseDuration: function (iPhase) {
            if (iPhase === 2) {
                return TANK_WIRE_CAGE_BUILD_MS;
            }

            return TANK_ASSEMBLY_PHASE_DURATION_MS;
        },

        _finalizeAssemblyPresentation: function (oTankGroup) {
            if (!oTankGroup) {
                return;
            }

            oTankGroup.traverse(function (oNode) {
                if (oNode.isLight || oNode.userData.assemblySkip) {
                    return;
                }

                if (oNode.name === "InventoryFill") {
                    return;
                }

                if (oNode.userData._asmBasePos) {
                    oNode.position.copy(oNode.userData._asmBasePos);
                }

                if (oNode.userData._asmBaseScale) {
                    oNode.scale.copy(oNode.userData._asmBaseScale);
                }

                if (oNode.isMesh && oNode.userData.wireCageWire) {
                    if (oNode.userData._asmBaseScale) {
                        oNode.scale.copy(oNode.userData._asmBaseScale);
                    } else {
                        oNode.scale.set(1, 1, 1);
                    }
                }

                if (oNode.isMesh || (oNode.isGroup && oNode.name)) {
                    oNode.visible = true;
                    oNode.updateMatrix();
                }
            });
        },

        _finishTankAssembly: function () {
            if (!this._bAssemblyReverse && this._oAssemblyTankGroup) {
                this._finalizeAssemblyPresentation(this._oAssemblyTankGroup);
            }

            this._bAssemblyActive = false;
            this._bAssemblyLiquidActive = false;
            this._iAssemblyFrame = null;

            if (this._fnAssemblyComplete) {
                this._fnAssemblyComplete();
            }

            this._forceViewportRedraw();
        },

        _tickTankAssembly: function () {
            if (!this._bAssemblyActive) {
                return;
            }

            var fNow = performance.now();

            if (this._bAssemblyReverse) {
                this._tickTankAssemblyReverse(fNow);
                return;
            }

            if (this._iAssemblyPhase === TANK_ASSEMBLY_LIQUID_PHASE) {
                if (!this._bAssemblyPhasePrimed) {
                    this._primeAssemblyLiquidCharge();
                    this._bAssemblyPhasePrimed = true;
                }

                this._tickAssemblyLiquidCharge(fNow);
                return;
            }

            if (this._bAssemblyInGap) {
                if (fNow - this._fAssemblyPhaseStart >= TANK_ASSEMBLY_PHASE_GAP_MS) {
                    this._bAssemblyInGap = false;
                    this._bAssemblyPhasePrimed = false;
                    this._fAssemblyPhaseStart = fNow;
                } else {
                    this._forceViewportRedraw();
                    this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
                    return;
                }
            }

            if (!this._bAssemblyPhasePrimed) {
                this._primeAssemblyPhase(this._iAssemblyPhase);
                this._bAssemblyPhasePrimed = true;
            }

            var fElapsed = fNow - this._fAssemblyPhaseStart;
            var fProgress = Math.min(fElapsed / this._getAssemblyPhaseDuration(this._iAssemblyPhase), 1);
            var aCurrent = this._aAssemblyPartsByPhase[this._iAssemblyPhase] || [];

            aCurrent.forEach(function (oPart) {
                this._applyAssemblyPartProgress(oPart, fProgress, false);
            }.bind(this));

            if (fProgress >= 1) {
                aCurrent.forEach(function (oPart) {
                    this._applyAssemblyPartProgress(oPart, 1, true);
                }.bind(this));

                if (this._iAssemblyPhase >= TANK_ASSEMBLY_LIQUID_PHASE - 1) {
                    this._iAssemblyPhase = TANK_ASSEMBLY_LIQUID_PHASE;
                    this._bAssemblyInGap = false;
                    this._bAssemblyPhasePrimed = false;
                    this._fAssemblyPhaseStart = fNow;
                    this._forceViewportRedraw();
                    this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
                    return;
                }

                this._iAssemblyPhase++;
                this._bAssemblyInGap = true;
                this._bAssemblyPhasePrimed = false;
                this._fAssemblyPhaseStart = fNow;
            }

            this._forceViewportRedraw();
            this._iAssemblyFrame = window.requestAnimationFrame(this._fnTickTankAssembly);
        },

        _stopTankAssembly: function () {
            this._bAssemblyActive = false;
            this._bAssemblyReverse = false;
            this._bAssemblyInGap = false;
            this._bAssemblyPhasePrimed = false;
            this._bAssemblyLiquidActive = false;
            this._fnAssemblyComplete = null;

            if (this._iAssemblyFrame) {
                window.cancelAnimationFrame(this._iAssemblyFrame);
                this._iAssemblyFrame = null;
            }

            if (this._oAssemblyTankGroup) {
                this._oAssemblyTankGroup.traverse(function (oNode) {
                    if (oNode.isMesh || (oNode.isGroup && oNode.name)) {
                        if (oNode.userData._asmBasePos) {
                            oNode.position.copy(oNode.userData._asmBasePos);
                        }

                        if (oNode.userData._asmBaseScale) {
                            oNode.scale.copy(oNode.userData._asmBaseScale);
                        }

                        if (typeof oNode.userData._asmBaseScaleY === "number") {
                            oNode.scale.y = oNode.userData._asmBaseScaleY;
                        }

                        if (typeof oNode.userData._asmBasePosY === "number") {
                            oNode.position.y = oNode.userData._asmBasePosY;
                        }

                        if (oNode.name !== "InventoryFill") {
                            oNode.visible = true;
                        }

                        oNode.updateMatrix();
                    }
                });
            }

            this._oAssemblyTankGroup = null;
            this._aAssemblyPartsByPhase = null;
        },

        _applyTankStatusEffects: function (oTankGroup) {
            if (!oTankGroup) {
                return;
            }

            var sStatus = (oTankGroup.userData.statusCode || oTankSceneConfigStore.statusCode || "E").toUpperCase();
            this._sTankStatusCode = sStatus;
            this._stopStatusEffects();

            if (sStatus === "E") {
                this._applyEmptyTankPresentation(oTankGroup);
                return;
            }

            this._prepareStatusEffectNodes(oTankGroup, sStatus);

            if (!this._bInteriorViewActive) {
                this._applyExteriorView(oTankGroup);
            }

            if (sStatus === "I" || sStatus === "P") {
                this._startStatusEffects(oTankGroup);
            }
        },

        _applyEmptyTankPresentation: function (oTankGroup) {
            var oFillGroup = oTankGroup.getObjectByName("InventoryFill");

            if (oFillGroup) {
                oFillGroup.visible = false;
            }

            oTankGroup.userData.targetFillLevel = 0;
            this._fCurrentDisplayFillLevel = 0;
            this._fBaselineFillLevel = 0;
            this._updateLevelGaugeFloat(oTankGroup, 0);
            this._hideStatusEffectNodes(oTankGroup);

            if (!this._bInteriorViewActive) {
                this._applyExteriorView(oTankGroup);
            }
        },

        _prepareStatusEffectNodes: function (oTankGroup, sStatus) {
            ensureInboundPipeFlowIndicator(oTankGroup, THREE);
            ensureQualityPendingPulseRing(oTankGroup, THREE);

            var oFlowGroup = oTankGroup.getObjectByName("InboundPipeFlow");
            var oPulseRing = oTankGroup.getObjectByName("InventoryFillEdgePulse");

            if (oFlowGroup) {
                oFlowGroup.visible = sStatus === "I";
            }

            if (oPulseRing) {
                oPulseRing.visible = sStatus === "P";
            }
        },

        _hideStatusEffectNodes: function (oTankGroup) {
            var oFlowGroup = oTankGroup.getObjectByName("InboundPipeFlow");
            var oPulseRing = oTankGroup.getObjectByName("InventoryFillEdgePulse");

            if (oFlowGroup) {
                oFlowGroup.visible = false;
            }

            if (oPulseRing) {
                oPulseRing.visible = false;
            }

            var oVerticalPipe = oTankGroup.getObjectByName("InboundVerticalPipe");

            if (oVerticalPipe && oVerticalPipe.material && oVerticalPipe.material.emissive) {
                oVerticalPipe.material.emissive.setHex(0x000000);
            }
        },

        _startStatusEffects: function (oTankGroup) {
            this._oStatusEffectTankGroup = oTankGroup;
            this._bStatusEffectsActive = true;

            if (!this._fnTickStatusEffects) {
                this._fnTickStatusEffects = this._tickStatusEffects.bind(this);
            }

            this._fnTickStatusEffects();
        },

        _tickStatusEffects: function () {
            if (!this._bStatusEffectsActive) {
                return;
            }

            var oTankGroup = this._oStatusEffectTankGroup;
            var fTime = performance.now() * 0.001;

            if (oTankGroup) {
                if (this._sTankStatusCode === "I") {
                    this._updateInboundPipeFlow(oTankGroup, fTime);
                } else if (this._sTankStatusCode === "P") {
                    this._updateQualityPendingPulse(oTankGroup, fTime);
                }
            }

            this._forceViewportRedraw();
            this._iStatusEffectsFrame = window.requestAnimationFrame(this._fnTickStatusEffects);
        },

        _stopStatusEffects: function () {
            this._bStatusEffectsActive = false;
            this._oStatusEffectTankGroup = null;

            if (this._iStatusEffectsFrame) {
                window.cancelAnimationFrame(this._iStatusEffectsFrame);
                this._iStatusEffectsFrame = null;
            }
        },

        _updateInboundPipeFlow: function (oTankGroup, fTime) {
            var oFlowGroup = oTankGroup.getObjectByName("InboundPipeFlow");

            if (!oFlowGroup) {
                return;
            }

            var fBottom = oFlowGroup.userData.pipeBottomY || 0.35;
            var fTop = oFlowGroup.userData.pipeTopY || 7.15;
            var fSpan = fTop - fBottom;
            var fPulse = 0.5 + 0.5 * Math.sin(fTime * 5.5);

            oFlowGroup.visible = true;
            oFlowGroup.children.forEach(function (oNode) {
                if (!oNode.userData) {
                    return;
                }

                var fPhase = (oNode.userData.flowPhase + fTime * 0.42) % 1;
                var fY = fTop - fPhase * fSpan;

                oNode.position.y = fY;
                oNode.visible = true;

                if (oNode.material && oNode.material.opacity !== undefined) {
                    oNode.material.opacity = oNode.name === "InboundPipeFlowRing"
                        ? 0.55 + fPulse * 0.4
                        : 0.75 + fPulse * 0.25;
                }
            });

            var oVerticalPipe = oTankGroup.getObjectByName("InboundVerticalPipe");

            if (oVerticalPipe && oVerticalPipe.material && oVerticalPipe.material.emissive) {
                var fGlow = 0.12 + fPulse * 0.28;
                oVerticalPipe.material.emissive.setRGB(fGlow * 0.2, fGlow * 0.45, fGlow);
            }
        },

        _updateQualityPendingPulse: function (oTankGroup, fTime) {
            var oFillGroup = oTankGroup.getObjectByName("InventoryFill");
            var oPulseRing = oTankGroup.getObjectByName("InventoryFillEdgePulse");

            if (!oFillGroup || !oFillGroup.visible || !oPulseRing) {
                if (oPulseRing) {
                    oPulseRing.visible = false;
                }
                return;
            }

            var fFloorY = oFillGroup.userData.fillFloorY || 0;
            var fSurfaceY = oFillGroup.userData.liquidSurfaceBaseY || fFloorY;
            var fPulse = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(fTime * 4.2));

            oPulseRing.position.y = fSurfaceY - fFloorY;
            oPulseRing.material.opacity = fPulse;
            oPulseRing.visible = true;

            var oBody = oFillGroup.getObjectByName("InventoryFillBody");

            if (oBody && oBody.material && oBody.material.emissive) {
                var fEmissive = 0.08 + 0.18 * (0.5 + 0.5 * Math.sin(fTime * 4.2));
                oBody.material.emissive.setRGB(fEmissive * 0.94, fEmissive * 0.42, 0);
            }
        },

        _applyExteriorView: function (oTankGroup) {
            var sStatus = (oTankGroup.userData.statusCode || oTankSceneConfigStore.statusCode || "E").toUpperCase();

            oTankGroup.traverse(function (oChild) {
                if (!oChild.isMesh || !oChild.material) {
                    return;
                }

                var oMat = oChild.material;
                var sName = oChild.name;
                var oOrig = oChild.userData._origMaterial;

                if (sName === "InventoryFillBody") {
                    oMat.transparent = true;
                    oMat.opacity = 0.92;
                    oMat.depthWrite = true;
                    if (oMat.emissive) {
                        if (sStatus === "P") {
                            oMat.emissive.setHex(0x5c2800);
                        } else {
                            oMat.emissive.setHex(0x000000);
                        }
                    }
                    oChild.renderOrder = 2;
                } else if (sName === "InventoryFillSurface") {
                    if (oMat.uniforms) {
                        if (oMat.uniforms.uWaveHeight) {
                            oMat.uniforms.uWaveHeight.value = sStatus === "A" ? 0.012 : 0.024;
                        }
                        if (oMat.uniforms.uAmbientSlosh) {
                            oMat.uniforms.uAmbientSlosh.value = sStatus === "A" ? 0.01 : 0.018;
                        }
                        if (oMat.uniforms.uMaxWaveHeight) {
                            oMat.uniforms.uMaxWaveHeight.value = sStatus === "A" ? 0.022 : 0.036;
                        }
                    }
                    oChild.renderOrder = 5;
                } else if (oChild.userData.wireCageWire) {
                    oMat.metalness = 0.84;
                    oMat.roughness = 0.34;
                    oMat.transparent = false;
                    oMat.opacity = 1;
                    oMat.depthWrite = true;
                    oChild.renderOrder = 3;
                } else if (sName === "TankShellBody") {
                    if (oOrig) {
                        oMat.transparent = oOrig.transparent;
                        oMat.opacity = oOrig.opacity;
                        oMat.depthWrite = oOrig.depthWrite;
                    }
                    oChild.renderOrder = 2;
                } else if (oOrig) {
                    oMat.transparent = oOrig.transparent;
                    oMat.opacity = oOrig.opacity;
                    oMat.depthWrite = oOrig.depthWrite;
                    if (oMat.emissive && oOrig.emissive !== null) {
                        oMat.emissive.setHex(oOrig.emissive);
                    }
                    oChild.renderOrder = 0;
                }
            });
        },

        _restoreExteriorView: function (oTankGroup) {
            this._setTankShellVisible(oTankGroup, true);
            this._applyExteriorView(oTankGroup);

            if (this._sTankStatusCode === "I" || this._sTankStatusCode === "P") {
                this._prepareStatusEffectNodes(oTankGroup, this._sTankStatusCode);
            }
        },

        _focusTankViewport: function (oViewport, oContent) {
            if (!oViewport) {
                return;
            }

            setTimeout(function () {
                var oTankNode = null;
                var oSceneRef = oContent && oContent.getSceneRef && oContent.getSceneRef();

                if (oSceneRef) {
                    oTankNode = oSceneRef.getObjectByName("StorageTank");
                }

                if (oTankNode) {
                    oViewport.zoomTo([ZoomTo.Node, ZoomTo.ViewFront], oTankNode, 0, 0.22);
                } else {
                    oViewport.zoomTo([ZoomTo.All, ZoomTo.ViewFront], null, 0, 0.22);
                }
            }, 120);
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments");

            this._resetTankViewportState(true);
            this._sWerks = oArgs.werks || "";
            this._sLgort = oArgs.lgort || "";
            this._loadTankDetail();
        },

        _loadTankDetail: function () {
            var oDetailModel = this.getView().getModel("tankDetail");
            var oODataModel = this.getView().getModel();

            if (!oODataModel || !this._sWerks || !this._sLgort) {
                return;
            }

            oDetailModel.setProperty("/busy", true);

            Promise.all([
                this._readPlantMaster(oODataModel, this._sWerks),
                this._readEntitySet(oODataModel, "/tankmasterSet", [
                    new Filter("Werks", FilterOperator.EQ, this._sWerks),
                    new Filter("Lgort", FilterOperator.EQ, this._sLgort)
                ]),
                this._readEntitySet(oODataModel, "/tankstockSet", [
                    new Filter("Werks", FilterOperator.EQ, this._sWerks),
                    new Filter("Lgort", FilterOperator.EQ, this._sLgort)
                ])
            ])
                .then(function (aResults) {
                    var oPlant = aResults[0];
                    var aTankMaster = aResults[1];
                    var aTankStock = aResults[2];
                    var oTank = aTankMaster[0];

                    if (!oTank) {
                        throw new Error("Tank not found");
                    }

                    var oStock = this._findMatchingStock(oTank, aTankStock);
                    var oDetail = this._buildDetailData(oPlant, oTank, oStock);

                    oDetailModel.setData(Object.assign(oDetailModel.getData(), oDetail));
                    this._updateSceneConfig(oDetail);
                    this._loadTankModel();
                }.bind(this))
                .catch(function () {
                    oDetailModel.setData(Object.assign(oDetailModel.getData(), {
                        headerTitle: "탱크 상세",
                        tankId: this._sLgort,
                        tankName: "탱크 " + this._sLgort,
                        plantLabel: "플랜트 " + this._sWerks,
                        summary: "데이터를 불러오지 못했습니다."
                    }));
                }.bind(this))
                .finally(function () {
                    oDetailModel.setProperty("/busy", false);
                });
        },

        _loadTankModel: function () {
            if (!this._bViewportReady || !this._oContentConnector) {
                return;
            }

            this._bInteriorViewActive = false;
            this.getView().getModel("tankDetail").setProperty("/interiorViewActive", false);
            this._oContentConnector.destroyAggregation("contentResources");
            this._oContentConnector.addContentResource(new ContentResource({
                source: TANK_MODEL_SOURCE,
                sourceType: TANK_MODEL_SOURCE_TYPE,
                sourceId: this._sLgort,
                name: this.getView().getModel("tankDetail").getProperty("/tankName")
            }));
        },

        _updateSceneConfig: function (oDetail) {
            var sStatusCode = (oDetail.statusCode || "E").toUpperCase();
            var fFillLevel = sStatusCode === "E" ? 0 : ((parseFloat(oDetail.level) || 0) / 100);

            oTankSceneConfigStore = {
                name: oDetail.tankName,
                fillLevel: fFillLevel,
                initialFillLevel: 0,
                fillColor: hexToNumber(oDetail.statusColor),
                shellColor: 0xB8BFC6,
                statusCode: sStatusCode
            };
        },

        _findMatchingStock: function (oTank, aTankStock) {
            var sMatnr = (oTank.Matnr || "").trim();

            if (!sMatnr) {
                return null;
            }

            return aTankStock.find(function (oStock) {
                return (oStock.Matnr || "").trim() === sMatnr;
            }) || aTankStock[0] || null;
        },

        _buildDetailData: function (oPlant, oTank, oStock) {
            var sMatnr = (oTank.Matnr || "").trim();
            var fCapacity = parseFloat(oTank.Capicity) || 0;
            var fInventory = sMatnr && oStock ? parseFloat(oStock.Quantity) || 0 : 0;
            var fAvailable = sMatnr && oStock ? parseFloat(oStock.Labst) || 0 : 0;
            var fLevel = fCapacity > 0 ? (fInventory / fCapacity) * 100 : 0;
            var oStatus = this._resolveStatus(oTank.Stat);
            var fTemperature = oStock ? parseFloat(oStock.TempV) || 0 : 0;
            var fApi = oStock ? parseFloat(oStock.ApiG) || 0 : 0;
            var fSulfur = oStock ? parseFloat(oStock.SulfC) || 0 : 0;
            var fQty15 = oStock ? parseFloat(oStock.Qty15) || 0 : 0;
            var fPickQ = oStock ? parseFloat(oStock.PickQ) || 0 : 0;
            var fSalk3 = oStock ? parseFloat(oStock.Salk3) || 0 : 0;
            fInventory = this._roundTo3(fInventory);
            fAvailable = this._roundTo3(fAvailable);

            return {
                busy: false,
                interiorViewActive: false,
                headerTitle: oTank.Lgort + " · " + (oTank.Tname || oTank.Lgort),
                tankId: oTank.Lgort,
                tankName: oTank.Tname || oTank.Lgort,
                plantLabel: [oPlant.Name1, oPlant.Werks || this._sWerks].filter(Boolean).join(" · "),
                plantName: oPlant.Name1 || this._sWerks || "",
                areaLabel: this._resolveTankArea(oTank.Lgort).label,
                capacity: fCapacity,
                currentInventory: fInventory,
                availableStock: fAvailable,
                level: Math.round(fLevel * 10) / 10,
                levelText: fLevel.toFixed(1) + "%",
                levelState: oStatus.levelState,
                statusCode: oStatus.code,
                statusText: oStatus.text,
                statusState: oStatus.state,
                statusIcon: oStatus.icon,
                statusColor: oStatus.color,
                stockWerks: oStock && (oStock.Werks || "").trim() ? oStock.Werks.trim() : "-",
                stockLgort: oStock && (oStock.Lgort || "").trim() ? oStock.Lgort.trim() : (oTank.Lgort || "-"),
                stockMatnr: oStock && (oStock.Matnr || "").trim() ? oStock.Matnr.trim() : (sMatnr || "-"),
                hasStockRecord: !!(oStock && sMatnr),
                stockBatchId: oStock && (oStock.BatchId || "").trim() ? oStock.BatchId.trim() : "-",
                stockQuantity: fInventory,
                stockQty15: this._roundTo3(fQty15),
                stockLabst: fAvailable,
                stockPickQ: this._roundTo3(fPickQ),
                stockTempText: fTemperature ? fTemperature.toFixed(1) + " °C" : "-",
                stockApiG: fApi,
                stockApiGText: fApi ? fApi.toFixed(2) : "-",
                stockSulfCText: fSulfur ? fSulfur.toFixed(3) + " %" : "-",
                stockSalk3: this._roundTo3(fSalk3),
                stockWaers: oStock && (oStock.Waers || "").trim() ? oStock.Waers.trim() : "",
                countUser: oStock && (oStock.Aenam || "").trim() ? oStock.Aenam.trim() : "-",
                countDate: oStock ? this._formatODataDate(oStock.Aedat) : "-",
                countTime: oStock ? this._formatODataTime(oStock.Aezet) : "-"
            };
        },

        _resolveTankArea: function (sTankId) {
            var nTankNo = parseInt(sTankId, 10);

            if (isNaN(nTankNo)) {
                return { key: "OTHER", label: "기타" };
            }

            if (nTankNo >= 1000 && nTankNo < 2000) {
                return { key: "1000", label: "1000번대 · 원유 저장" };
            }

            if (nTankNo >= 2000 && nTankNo < 3000) {
                return { key: "2000", label: "2000번대 · 공정 중간" };
            }

            if (nTankNo >= 3000 && nTankNo < 4000) {
                return { key: "3000", label: "3000번대 · 제품 출하" };
            }

            return { key: "OTHER", label: "기타" };
        },

        _resolveStatus: function (sStat) {
            var sCode = sStat === null || sStat === undefined ? "" : String(sStat).trim().toUpperCase();

            if (!sCode || sCode === "NULL") {
                sCode = "E";
            }

            var oStatus = STATUS_MAP[sCode];

            if (oStatus) {
                return Object.assign({ code: sCode }, oStatus);
            }

            return Object.assign({ code: "E" }, STATUS_MAP.E);
        },

        _readPlantMaster: function (oModel, sWerks) {
            return new Promise(function (resolve, reject) {
                oModel.read("/plant_masterSet", {
                    filters: [new Filter("Werks", FilterOperator.EQ, sWerks)],
                    success: function (oData) {
                        resolve((oData.results || [])[0] || {});
                    },
                    error: reject
                });
            });
        },

        _readEntitySet: function (oModel, sPath, aFilters) {
            return new Promise(function (resolve, reject) {
                oModel.read(sPath, {
                    filters: aFilters || [],
                    success: function (oData) {
                        resolve(oData.results || []);
                    },
                    error: function (oError) {
                        reject(oError);
                    }
                });
            });
        },

        _roundTo3: function (fValue) {
            return Math.round((parseFloat(fValue) || 0) * 1000) / 1000;
        },

        _formatODataDate: function (vDate) {
            if (!vDate) {
                return "-";
            }

            var oDate = vDate instanceof Date ? vDate : new Date(vDate);

            if (isNaN(oDate.getTime())) {
                return "-";
            }

            var sYear = oDate.getFullYear();
            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            var sDay = String(oDate.getDate()).padStart(2, "0");

            return sYear + "." + sMonth + "." + sDay;
        },

        _formatODataTime: function (vTime) {
            if (vTime === null || vTime === undefined || vTime === "") {
                return "-";
            }

            if (typeof vTime === "object" && typeof vTime.ms === "number") {
                var nTotalMs = vTime.ms;
                var nHours = Math.floor(nTotalMs / 3600000);
                var nMinutes = Math.floor((nTotalMs % 3600000) / 60000);
                var nSeconds = Math.floor((nTotalMs % 60000) / 1000);

                return [
                    String(nHours).padStart(2, "0"),
                    String(nMinutes).padStart(2, "0"),
                    String(nSeconds).padStart(2, "0")
                ].join(":");
            }

            var sTime = String(vTime).trim();

            if (/^PT/i.test(sTime)) {
                var oMatch = sTime.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);

                if (oMatch) {
                    return [
                        String(parseInt(oMatch[1] || "0", 10)).padStart(2, "0"),
                        String(parseInt(oMatch[2] || "0", 10)).padStart(2, "0"),
                        String(parseInt(oMatch[3] || "0", 10)).padStart(2, "0")
                    ].join(":");
                }
            }

            if (/^\d{6}$/.test(sTime)) {
                return sTime.slice(0, 2) + ":" + sTime.slice(2, 4) + ":" + sTime.slice(4, 6);
            }

            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(sTime)) {
                return sTime.length === 5 ? sTime + ":00" : sTime;
            }

            return sTime || "-";
        },

        onRefresh: function () {
            this._loadTankDetail();
        },

        onInventoryMeasurePress: function () {
            this._fBaselineFillLevel = this._fCurrentDisplayFillLevel != null
                ? this._fCurrentDisplayFillLevel
                : (oTankSceneConfigStore.fillLevel || 0);
            this._bMeasurePreviewActive = true;
            this._resetMeasurementForm();
            this._openInventoryMeasureDialog().then(function () {
                this._syncMeasurementPreview3D();
            }.bind(this));
        },

        onTankUsageHistoryPress: function () {
            MessageToast.show("탱크 사용 이력 기능은 준비 중입니다.");
        },

        onLossHistoryPress: function () {
            MessageToast.show("Loss 이력 조회 기능은 준비 중입니다.");
        },

        onInventoryMeasureConfirm: function () {
            var oDetailModel = this.getView().getModel("tankDetail");
            var fMeasuredQuantity = parseFloat(oDetailModel.getProperty("/measurement/measuredQuantity"));
            var fCorrectedQuantity = parseFloat(oDetailModel.getProperty("/measurement/calculatedQuantity"));

            if (isNaN(fMeasuredQuantity) || fMeasuredQuantity < 0) {
                MessageToast.show("실측 수량을 입력해 주세요.");
                return;
            }

            if (isNaN(fCorrectedQuantity) || fCorrectedQuantity < 0) {
                MessageToast.show("계산 버튼을 눌러 보정 수량을 산출해 주세요.");
                return;
            }

            if (!oDetailModel.getProperty("/hasStockRecord")) {
                MessageToast.show("저장할 탱크 재고 데이터가 없습니다.");
                return;
            }

            oDetailModel.setProperty("/busy", true);

            this._saveInventoryMeasurement()
                .then(function () {
                    MessageToast.show("재고 실측 결과를 저장했습니다.");
                    this._closeInventoryMeasureDialog(false);
                    this._loadTankDetail();
                }.bind(this))
                .catch(function (oError) {
                    MessageToast.show(this._getODataErrorMessage(oError, "재고 실측 저장에 실패했습니다."));
                }.bind(this))
                .finally(function () {
                    oDetailModel.setProperty("/busy", false);
                });
        },

        _saveInventoryMeasurement: function () {
            var oDetailModel = this.getView().getModel("tankDetail");
            var oODataModel = this.getView().getModel();
            var fMeasuredQuantity = parseFloat(oDetailModel.getProperty("/measurement/measuredQuantity"));
            var fCorrectedQuantity = parseFloat(oDetailModel.getProperty("/measurement/calculatedQuantity"));
            var fTemperature = parseFloat(oDetailModel.getProperty("/measurement/temperature"));
            var sMatnr = (oDetailModel.getProperty("/stockMatnr") || "").trim();
            var sWerks = (oDetailModel.getProperty("/stockWerks") || this._sWerks || "").trim();
            var sLgort = (oDetailModel.getProperty("/stockLgort") || this._sLgort || "").trim();

            if (!oODataModel) {
                return Promise.reject(new Error("OData model not available"));
            }

            if (!sMatnr || sMatnr === "-") {
                return Promise.reject(new Error("Tank stock key is missing"));
            }

            if (isNaN(fTemperature)) {
                fTemperature = 15;
            }

            var oPayload = {
                Qty15: this._roundTo3(fMeasuredQuantity).toFixed(3),
                TempV: fTemperature.toFixed(1),
                Quantity: this._roundTo3(fCorrectedQuantity).toFixed(3)
            };

            return new Promise(function (resolve, reject) {
                oODataModel.update(this._buildTankStockEntityPath(sMatnr, sWerks, sLgort), oPayload, {
                    success: function (oData) {
                        resolve(oData);
                    },
                    error: function (oError) {
                        reject(oError);
                    }
                });
            }.bind(this));
        },

        _buildTankStockEntityPath: function (sMatnr, sWerks, sLgort) {
            return [
                "/tankstockSet(Matnr='",
                this._escapeODataKeyValue(sMatnr),
                "',Werks='",
                this._escapeODataKeyValue(sWerks),
                "',Lgort='",
                this._escapeODataKeyValue(sLgort),
                "')"
            ].join("");
        },

        _escapeODataKeyValue: function (sValue) {
            return String(sValue || "").replace(/'/g, "''");
        },

        _getODataErrorMessage: function (oError, sDefaultMessage) {
            var sMessage = sDefaultMessage;

            if (!oError) {
                return sMessage;
            }

            try {
                var oResponse = JSON.parse(oError.responseText || "");
                var oErrorBody = oResponse && oResponse.error;

                if (oErrorBody && oErrorBody.message && oErrorBody.message.value) {
                    return oErrorBody.message.value;
                }
            } catch (oParseError) {
                // ignore parse errors and use fallback message
            }

            if (oError.message) {
                return oError.message;
            }

            return sMessage;
        },

        onInventoryMeasureCancel: function () {
            this._closeInventoryMeasureDialog();
        },

        onInventoryMeasureLiveChange: function () {
            this._syncMeasurementPreview3D();
        },

        onInventoryMeasureCalculate: function () {
            var oDetailModel = this.getView().getModel("tankDetail");
            var fMeasuredQuantity = parseFloat(oDetailModel.getProperty("/measurement/measuredQuantity"));
            var fApi = parseFloat(oDetailModel.getProperty("/stockApiG"));

            if (isNaN(fMeasuredQuantity) || fMeasuredQuantity < 0) {
                MessageToast.show("실측 수량을 입력해 주세요.");
                return;
            }

            if (isNaN(fApi)) {
                MessageToast.show("API 비중 정보가 없어 계산할 수 없습니다.");
                return;
            }

            this._updateMeasurementQuantity();
            this._syncMeasurementPreview3D();
        },

        _computeVcfMeasurement: function (fMeasuredQuantity, fApi, fTemperature) {
            var STANDARD_TEMP = 15;
            var API_NUMERATOR = 141.5;
            var API_DENOM_OFFSET = 131.5;
            var THERMAL_EXP_NUM = 0.0006139723;
            var VCF_FACTOR = 0.8;

            if (isNaN(fMeasuredQuantity) || fMeasuredQuantity < 0) {
                return null;
            }

            var fApiG = parseFloat(fApi);
            var fTempV = parseFloat(fTemperature);

            if (isNaN(fApiG)) {
                return null;
            }

            if (isNaN(fTempV)) {
                fTempV = STANDARD_TEMP;
            }

            var fDensity15 = API_NUMERATOR / (fApiG + API_DENOM_OFFSET);

            if (!isFinite(fDensity15) || fDensity15 === 0) {
                return null;
            }

            var fA15 = THERMAL_EXP_NUM / (fDensity15 * fDensity15);
            var fTempDiff = fTempV - STANDARD_TEMP;
            var fVcfInner = 1 + VCF_FACTOR * fA15 * fTempDiff;
            var fVcfExponent = -1 * fA15 * fTempDiff * fVcfInner;
            var fVcf = Math.exp(fVcfExponent);
            var fResult = fMeasuredQuantity * fVcf;

            var sApi = this._formatFormulaValue(fApiG, 2);
            var sTemp = this._formatFormulaValue(fTempV, 1);
            var sMeasured = this._formatFormulaValue(fMeasuredQuantity, 3);
            var sDensity = this._formatFormulaValue(fDensity15, 8);
            var sA15 = this._formatFormulaValue(fA15, 10);
            var sTempDiff = this._formatFormulaValue(fTempDiff, 1);
            var sVcfInner = this._formatFormulaValue(fVcfInner, 10);
            var sVcf = this._formatFormulaValue(fVcf, 10);
            var sResult = this._formatFormulaValue(this._roundTo3(fResult), 3);
            var sFormulaText = this._buildVcfFormulaText(sApi, sTemp, sMeasured, sDensity, sA15, sTempDiff, sVcfInner, sVcf, sResult);

            return {
                result: this._roundTo3(fResult),
                formulaText: sFormulaText,
                formulaSummary: "-> " + sResult + " BBL",
                formulaDetails: sFormulaText
            };
        },

        _buildVcfFormulaText: function (sApi, sTemp, sMeasured, sDensity, sA15, sTempDiff, sVcfInner, sVcf, sResult) {
            var aLineTexts = [
                [
                    "1. 15°C 기준 밀도 [ 141.5 / (API + 131.5) ]",
                    "141.5 / (" + sApi + " + 131.5)",
                    "-> " + sDensity
                ].join("\n"),
                [
                    "2. 열팽창계수 0.0006139723 / 15도 밀도²",
                    "0.0006139723 / (" + sDensity + "²)",
                    "-> " + sA15
                ].join("\n"),
                [
                    "3. 온도차",
                    "실측 온도 - 기준 온도",
                    sTemp + " - 15",
                    "-> " + sTempDiff
                ].join("\n"),
                [
                    "4. VCF exp(-열팽창계수 × 온도차 × (1 + 0.8 × 열팽창계수 × 온도차))",
                    "exp(-" + sA15 + " × " + sTempDiff + " × " + sVcfInner + ")",
                    "-> " + sVcf
                ].join("\n"),
                [
                    "5. 미보정 수량 × VCF",
                    sMeasured + " × " + sVcf,
                    "-> " + sResult + " BBL"
                ].join("\n")
            ];

            return aLineTexts.join("\n\n");
        },

        _formatFormulaValue: function (vValue, iDecimals) {
            var fValue = parseFloat(vValue);

            if (isNaN(fValue)) {
                return "-";
            }

            return fValue.toFixed(iDecimals);
        },

        _updateMeasurementQuantity: function () {
            var oDetailModel = this.getView().getModel("tankDetail");
            var fMeasuredQuantity = parseFloat(oDetailModel.getProperty("/measurement/measuredQuantity"));
            var fApi = parseFloat(oDetailModel.getProperty("/stockApiG"));
            var fTemperature = parseFloat(oDetailModel.getProperty("/measurement/temperature"));
            var oCalculation = this._computeVcfMeasurement(fMeasuredQuantity, fApi, fTemperature);

            if (!oCalculation) {
                oDetailModel.setProperty("/measurement/calculatedQuantity", "");
                oDetailModel.setProperty("/measurement/formulaVisible", false);
                oDetailModel.setProperty("/measurement/formulaText", "");
                return;
            }

            oDetailModel.setProperty("/measurement/calculatedQuantity", oCalculation.result);
            oDetailModel.setProperty("/measurement/formulaVisible", true);
            oDetailModel.setProperty("/measurement/formulaText", oCalculation.formulaText);
        },

        _loadInventoryMeasureDialog: function () {
            if (this._bInventoryMeasureDialogLoaded) {
                return Promise.resolve(this._oInventoryMeasureDialog);
            }

            return Fragment.load({
                id: this.getView().getId(),
                name: "test.t1.test.inventory.view.fragments.InventoryMeasureDialog",
                controller: this
            }).then(function (oDialog) {
                this._oInventoryMeasureDialog = oDialog;
                this.getView().addDependent(oDialog);
                this._bInventoryMeasureDialogLoaded = true;
                return oDialog;
            }.bind(this));
        },

        _openInventoryMeasureDialog: function () {
            return this._loadInventoryMeasureDialog().then(function (oDialog) {
                oDialog.open();
            });
        },

        _closeInventoryMeasureDialog: function (bRestorePreview) {
            if (this._oInventoryMeasureDialog) {
                this._oInventoryMeasureDialog.close();
            }

            if (bRestorePreview !== false) {
                this._endMeasurePreview3D();
            } else {
                this._bMeasurePreviewActive = false;
                this._stopFillLevelAnimation();
            }
        },

        _resetMeasurementForm: function () {
            var oDetailModel = this.getView().getModel("tankDetail");
            var fQty15 = parseFloat(oDetailModel.getProperty("/stockQty15")) || 0;
            var sTempText = String(oDetailModel.getProperty("/stockTempText") || "").replace(/[^\d.-]/g, "");
            var fTemperature = parseFloat(sTempText);

            oDetailModel.setProperty("/measurement", {
                measuredQuantity: fQty15,
                temperature: isNaN(fTemperature) ? "" : fTemperature,
                calculatedQuantity: "",
                formulaVisible: false,
                formulaText: ""
            });
        },

        onCloseDetail: function () {
            this._resetTankViewportState(true);
            this.getOwnerComponent().getRouter().navTo("RouteTank", {
                werks: this._sWerks
            });
        },

        onNavBack: function () {
            this.onCloseDetail();
        },

        onHomeBreadcrumbPress: function () {
            this._resetTankViewportState(true);
            this.getOwnerComponent().getRouter().navTo("RouteMain");
        },

        onPlantBreadcrumbPress: function () {
            this._resetTankViewportState(true);
            this.getOwnerComponent().getRouter().navTo("RouteTank", {
                werks: this._sWerks
            });
        }
    });
});
