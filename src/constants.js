const BUILDS = Object.freeze({
    none: -1,
    sly2ntsc: 0,
    sly3ntsc: 1,
    sly2mar: 2,
    sly3aug: 3,
    sly3sep: 4,
    sly3jul: 5
});

const HeadAddresses = Object.freeze([
    0x3e0b04, // 0
    0x478c8c, // 1
    0x3EE52C, // 2
    0x000000, // 3
    0x000000, // 4
    0x46aef4 // 5
]);

const WorldAddresses = Object.freeze([
    0x3D4A60, // 0
    0x468D30, // 1
    0x45C398, // 2
    0x000000, // 3
    0x000000, // 4
    0x45AFB0 // 5
]);

module.exports = {
    BUILDS,
    HeadAddresses,
    WorldAddresses
}