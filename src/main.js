'use strict';

// Import packages
const { app, BrowserWindow, autoUpdater, dialog } = require('electron');
const ipc = require('electron').ipcMain;
const memoryjs = require('memoryjs');
const { readFileSync, existsSync, writeFile } = require('fs');

// Runtime Variables
const memoryBase = 0x20000000; // works for pcsx2 1.6, but not 1.7
const tasks = {};
let GAME = -1;
let BUILD = -1;
let processObject = undefined;
let worldId = 0;

// Application Variables
const appSettings = JSON.parse(existsSync("config.json") ? readFileSync("config.json").toString(): '{}');
let autoDetectBuild = appSettings.autoDetectBuild ?? true;
let nodesDisplay = appSettings.nodesDisplay ?? 'name';

module.exports = {
    GAME: function() { return GAME; },
    BUILD: function() { return BUILD; },
    processObject: function() { return processObject; },
    worldId: function() { return worldId; },
    memoryBase,
    settings: function() {
        return {
            autoDetectBuild,
            nodesDisplay
        };
    },
    tasks: function() { return tasks; }
}

// define requires to local files later to prevent circular imports
const { BUILDS, WorldAddresses, HeadAddresses } = require("./constants");
const { Graph, Memory } = require("./structures");

// Declare DAG and tasks dict
const dag = new Graph();
for (const num of Object.values(BUILDS)) {
    if (num == -1)
        continue;
    tasks[num] = {};
}

function reattach() {
    try {
        processObject = memoryjs.openProcess('pcsx2.exe');
        //console.log("Connected to PCSX2");
    } catch(err) {
        //console.log("PCSX2 not detected. Make sure PCSX2 is open.");
        processObject = undefined;
        return;
    }
}

function detectGame() {
    if (Memory.read(0x92CE0, memoryjs.UINT32) != 1) {
        //console.log("No game detected. Make sure the game is running.");
        BUILD = -1;
        return;
    }

    // detect which game is running and set BUILD
    var buildString = '';
    // /console.log(readMemory(0x15395, memoryjs.STRING));
    // readMemory(0x15b90, memoryjs.STRING)
    // Sly 2 - Retail
    if (buildString = Memory.read(0x15395, memoryjs.STRING), buildString.indexOf('973.16') > -1) {
        GAME = 0;
        BUILD = BUILDS.sly2ntsc;
    }
    // Sly 3 - July
    else if (buildString = Memory.read(0x33e838, memoryjs.STRING), buildString.indexOf('0716.1854') > -1) {
        GAME = 1;
        BUILD = BUILDS.sly3jul;
    }
    // Sly 3 - Retail
    else if (buildString = Memory.read(0x15390, memoryjs.STRING), buildString.indexOf('974.64') > -1) {
        GAME = 1;
        BUILD = BUILDS.sly3ntsc;
    }
    // Sly 2 - March Proto
    else if (buildString = Memory.read(0x15b90, memoryjs.STRING), buildString.indexOf('971.98') > -1) {
        GAME = 0;
        BUILD = BUILDS.sly2mar;
    } else { // Invalid/Unsupported build
        console.log("Invalid game detected (" + buildString + "). Make sure Sly 2 or 3 (NTSC) is running. (");
        GAME = BUILD = -1;
    }
}

// Handle events from renderer.js
ipc.on('force-state', function(event, store) {
    let node = new Node(parseInt(store.node, 16));
    node.forceState(store.state);
});
ipc.on('reset-dag', function() {
    dag.reset();
});
ipc.on('refresh-dag', function() {
    dag.populateGraph(dag.head);
});
ipc.on('export-dot', function() {
    const dot = dag.dot();
    writeFile('export.dot', dot, err => {
        if (err)
            return console.error(err);
        console.log("Exported DAG to export.dot");
    });
});
ipc.on('set-settings', function(event, store) {
    autoDetectBuild = store['auto-detect-build'];
    if (!autoDetectBuild)
        BUILD = BUILDS[store['build']];
    nodesDisplay = store['nodes-display'];
    var baseAddress = store['base-address'];
});

function createWindow() {
    const win = new BrowserWindow({
        width: 700,
        height: 700,
        icon: `${__dirname}/public/img/appicon.png`,
        transparent: false,
        frame: false,
        hasShadow: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: `${__dirname}/preload.js`
        }
    });
    win.on('closed', function() {
        app.quit();
    });
    win.loadFile(`${__dirname}/public/index.html`);
    return win;
}

app.whenReady().then(() => {
    const win = createWindow();

    // autoUpdater.on("error", (error) => {
    //     dialog.showErrorBox("Error", `An error occurred while updating\n\n${error.toString()}`);
    // });
    // autoUpdater.on("update-downloaded", () => {
    //     const res = dialog.showMessageBoxSync(win, {
    //         message: "A new update has been downloaded. Would you like to install it now?",
    //         type: "question",
    //         buttons: ["Yes", "No"],
    //         title: "Install Update"
    //     });
    //     if (res == 0)
    //         autoUpdater.quitAndInstall();
    // });
    // autoUpdater.setFeedURL({ url: "https://github.com/DeathHound6/dagviz/releases" });
    // autoUpdater.checkForUpdates();

    ipc.on('minimize', () => {
        win.minimize();
    });
    ipc.on('maximize', () => {
        win.maximize();
    });

    // Try to update graph and send dot text to window every 500ms
    setInterval(() => {
        // Try to attach to PCSX2
        reattach();
        if (processObject == undefined)
            // Handle PCSX2 not detected
            return win.webContents.send('no-game', 'PCSX2 not detected.');
        // Try to detect currently running game
        if (autoDetectBuild) {
            detectGame();
            win.webContents.send('build', BUILD);
        }

        if (BUILD == -1)
            // Handle no game detected
            return win.webContents.send('no-game', 'Game not detected.');

        tasks[BUILD] = JSON.parse(readFileSync(`${__dirname}/tasks-${BUILD}.json`));

        worldId = Memory.read(WorldAddresses[BUILD], memoryjs.UINT32);

        // Convert Sly 3 world IDs to episode IDs
        if (BUILD == BUILDS.sly3ntsc) {
            if (worldId == 2)
                worldId = 'N/A'; // Sly 3 Hazard Room
            else if (worldId == 1)
                worldId = 0; // Sly 3 Prologue
            else
                worldId -= 2; // all other Sly 3 worlds
        }

        // Get root node of current dag
        let rootNode = 0x0;
        if (BUILD == BUILDS.sly2ntsc && worldId == 3)
            rootNode = Memory.read(Memory.read(0x3e0b04, memoryjs.UINT32) + 0x20, memoryjs.UINT32); // manually set root for Sly 2 ep3
        else
            rootNode = Memory.read(HeadAddresses[BUILD], memoryjs.UINT32); // automatically get it for the rest of them

        // Check and update the dag, only if the root is not null
        if (rootNode != 0x0) {
            // Check if the game is loading
            let isLoading = false;
            if (BUILD == BUILDS.sly2ntsc && (Memory.read(0x3D4830, memoryjs.UINT32) == 0x1))
                isLoading = true;
            else if (BUILD == BUILDS.sly3ntsc && (Memory.read(0x467B00, memoryjs.UINT32) == 0x1))
                isLoading = true
            else
                isLoading = false;

            // if the dag head is out of date, wait until 0.4 sec after level load to repopulate
            if ((rootNode != dag.head) && !(isLoading)) {
                setTimeout(() => {
                    dag.populateGraph(rootNode);
                }, 400);
            }

            win.webContents.send('dot-text', dag.dot());
            win.webContents.send('world-id', worldId);
        }
    }, 500);
});