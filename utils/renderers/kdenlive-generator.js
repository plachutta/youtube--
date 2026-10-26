'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Generate an MLT XML project from AgentTube scenes.
 * @param {Array} scenes - Array of scene objects from planScenes/buildEnginePlan
 * @param {Object} options - Generation options
 * @param {number} options.fps - Frames per second (default: 30)
 * @param {string} options.outputPath - Output .mlt or .kdenlive file path
 * @returns {string} The generated XML content
 */
function generateMltProject(scenes, options) {
  var fps = options.fps || 30;
  var outputFile = path.join(os.tmpdir(), 'agenttube-project-' + Date.now() + '.mlt');
  var timelineScenes = [].concat(scenes).sort(function(a, b) { return a.startFrame - b.startFrame; });

  var xml = '<?xml version="1.0" encoding="utf-8"?>';
  xml += '<mlt>';

  // Generate video producers with unique IDs
  for (var i = 0; i < timelineScenes.length; i++) {
    var scene = timelineScenes[i];
    var durationFrames = Math.max(1, Math.round(scene.durationSec * fps));
    var startFrames = Math.round(scene.startFrame * fps);
    var productionLabel = scene.productionLabel || 'scene';

    xml += '  <producer id="vid' + i + '">';
    xml += '    <property name="title">' + productionLabel + '</property>';
    xml += '  mlt_service="color"';
    xml += '  <property name="color">0x0b1020</property>';
    xml += '  <property name="duration"> ' + durationFrames + '</property>';
    xml += '  <property name="in">0</property>';
    xml += '  <property name="out"> ' + durationFrames + '</property>';
    xml += '  </producer>';
  }

  // Generate playlist with entries referencing producer IDs
  xml += '  <playlist id="play' + Date.now() + '">';
  for (var i = 0; i < timelineScenes.length; i++) {
    var durationFrames = Math.max(1, Math.round(timelineScenes[i].durationSec * fps));
    xml += '    <entry producer="vid' + i + '" in="0" out="' + durationFrames + '"/>';
  }
  xml += '  </playlist>';

  // Generate audio producers and playlist entries
  for (var i = 0; i < timelineScenes.length; i++) {
    var scene = timelineScenes[i];
    var durationFrames = Math.round(scene.durationSec * fps);
    xml += '  <producer id="aud' + i + '">';
    if (scene.audioRef) {
      if (scene.audioRef.startsWith('wav:')) {
        var audioId = scene.audioRef.replace('wav:', '');
        xml += '    <property name="audio">' + audioId + '</property>';
        xml += '  mlt_service="audio"';
      } else if (scene.audioRef.startsWith('file:')) {
        xml += '    <property name="resource">' + scene.audioRef + '</property>';
        xml += '  mlt_service="audio"';
      }
    }
    xml += '  <property name="color">0x0b1020</property>';
    xml += '  <property name="duration"> ' + durationFrames + '</property>';
    xml += '  </producer>';
  }

  // Generate tractor connecting playlist to tracks
  // Use video producer IDs directly (vid0, vid1, etc.) referencing the playlist entries
  xml += '  <tractor id="tractor' + Date.now() + '" title="agenttube-project" in="0" out="-1">';
  var tractorTrackCount = Math.min(timelineScenes.length, 2);
  for (var t = 0; t < tractorTrackCount; t++) {
    xml += '    <track producer="vid' + t + '"/>';
  }
  xml += '  </tractor>';

  // Generate transitions between consecutive scenes
  for (var i = 0; i < timelineScenes.length - 1; i++) {
    var enterFrames = Math.round(0.4 * fps);
    var exitFrames = Math.round(0.4 * fps);
    xml += '  <transition type="fade">';
    xml += '    <property name="enter">' + enterFrames + '</property>';
    xml += '    <property name="exit">' + exitFrames + '</property>';
    xml += '  </transition>';
  }

  xml += '</mlt>';
  fs.writeFileSync(outputFile, xml, 'utf8');
  return xml;
}

/**
 * Validate a generated MLT project XML.
 * @param {string} xml - The generated XML content
 * @returns {Object} Validation result with ok flag and any findings
 */
function validateMltProject(xml) {
  var findings = [];

  if (!xml || typeof xml !== 'string') {
    return { ok: false, findings: ['No XML content provided'] };
  }

  // Check for valid MLT root element
  if (!xml.includes('<mlt>')) {
    findings.push('Missing <mlt> root element');
  }

  // Check for required structure: producers, playlist, tractor
  if (!xml.includes('<producer')) {
    findings.push('Missing <producer> elements');
  }

  if (!xml.includes('<playlist>')) {
    findings.push('Missing <playlist> element');
  }

  if (!xml.includes('<tractor>')) {
    findings.push('Missing <tractor> element');
  }

  // Check that playlist entries reference valid producers
  var producerIds = xml.match(/<producer id="([^"]+)">/g);
  if (producerIds) {
    var playlistEntries = xml.match(/<entry producer="([^"]+)"/g);
    if (playlistEntries) {
      for (var i = 0; i < playlistEntries.length; i++) {
        var ref = playlistEntries[i].match(/producer="([^"]+)"/)[1];
        var found = false;
        for (var j = 0; j < producerIds.length; j++) {
          if (producerIds[j].includes(ref)) {
            found = true;
            break;
          }
        }
        if (!found) {
          findings.push('Playlist entry references undefined producer: ' + ref);
        }
      }
    }
  }

  return { ok: findings.length === 0, findings: findings };
}

/**
 * Generate a kdenlive project file.
 * @param {Array} scenes - Array of scene objects
 * @param {Object} options - Generation options
 * @returns {string} The generated KDELive project XML
 */
function generateKdenliveProject(scenes, options) {
  // For now, just generate the MLT project and return it
  return generateMltProject(scenes, options);
}

/**
 * Generate a scene clip XML.
 * @param {Object} scene - Scene object
 * @param {number} fps - Frames per second
 * @returns {string} MLT producer XML
 */
function generateSceneClip(scene, fps) {
  fps = fps || 30;
  var durationSec = scene.durationSec;
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0) {
    durationSec = 0;
  }
  var durationFrames = Math.round(durationSec * fps);
  durationFrames = Math.max(0, durationFrames);

  var xml = '  <producer>';
  xml += '    <property name="title">' + (scene.productionLabel || 'scene') + '</property>';
  xml += '  mlt_service="color"';
  xml += '  <property name="color">0x0b1020</property>';
  xml += '  <property name="duration"> ' + durationFrames + '</property>';
  xml += '  <property name="in">0</property>';
  xml += '  <property name="out"> ' + durationFrames + '</property>';
  xml += '  </producer>';
  return xml;
}

/**
 * Generate transition XML between two scenes.
 * @param {Object} sceneA - First scene
 * @param {Object} sceneB - Second scene
 * @param {number} fps - Frames per second
 * @returns {string} MLT transition XML
 */
function generateTransition(sceneA, sceneB, fps) {
  // Validate fps - must be a finite positive number; safe default to 30
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 1) {
    fps = 30;
  }
  var enterFrames = Math.round(0.4 * fps);
  var exitFrames = Math.round(0.4 * fps);

  var xml = '    <transition type="fade">';
  xml += '      <property name="enter">' + enterFrames + '</property>';
  xml += '      <property name="exit">' + exitFrames + '</property>';
  xml += '    </transition>';
  return xml;
}

/**
 * Generate audio clip XML for a scene's narration audio reference.
 * @param {Object} scene - Scene object
 * @param {number} fps - Frames per second
 * @returns {string} MLT producer XML or empty string
 */
function generateAudioClip(scene, fps) {
  // Validate fps - must be a finite positive number; safe default to 30
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 1) {
    fps = 30;
  }
  // Validate scene and durationSec
  if (!scene || typeof scene !== 'object') {
    // Return a valid empty-placeholder producer rather than empty string
    return '  <producer>' +
      '    <property name="title">narration</property>' +
      '  mlt_service="audio"' +
      '  <property name="color">0x0b1020</property>' +
      '  <property name="duration"> 0</property>' +
      '  </producer>';
  }
  var durationSec = scene.durationSec;
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0) {
    durationSec = 0;
  }
  var durationFrames = Math.round(durationSec * fps);
  // Ensure durationFrames is non-negative
  durationFrames = Math.max(0, durationFrames);

  var narrationRef = scene.audioRef;
  var clip = '  <producer>';

  if (!narrationRef) {
    // Audio not requested - still produce valid placeholder
    clip += '    <property name="title">narration</property>';
    clip += '  mlt_service="audio"';
    clip += '  <property name="color">0x0b1020</property>';
    clip += '  <property name="duration"> ' + durationFrames + '</property>';
    clip += '  </producer>';
    return clip;
  }

  if (typeof narrationRef === 'string' && narrationRef.startsWith('wav:')) {
    var audioId = narrationRef.replace('wav:', '');
    clip += '    <property name="audio">' + audioId + '</property>';
    clip += '  mlt_service="audio"';
  } else if (typeof narrationRef === 'string' && narrationRef.startsWith('file:')) {
    clip += '    <property name="resource">' + narrationRef + '</property>';
  } else {
    // Optional audio unavailable or unknown reference type - produce placeholder
    clip += '    <property name="title">narration</property>';
    clip += '  mlt_service="audio"';
    clip += '  <property name="color">0x0b1020</property>';
    clip += '  <property name="duration"> ' + durationFrames + '</property>';
    clip += '  </producer>';
    return clip;
  }

  // Valid audio media configured
  clip += '  <property name="duration"> ' + durationFrames + '</property>';
  clip += '  </producer>';
  return clip;
}

module.exports = {
  generateMltProject,
  generateKdenliveProject,
  validateMltProject,
  generateSceneClip,
  generateTransition,
  generateAudioClip
};
