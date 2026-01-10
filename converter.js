// Global state
let elmultiFile = null;
let wavFile = null;
let wavFiles = [];
let presetData = null;

// Mode switching
function switchMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.mode-panel').forEach(panel => panel.classList.remove('active'));

    if (mode === 'elektron') {
        document.getElementById('elektron-mode-btn').classList.add('active');
        document.getElementById('elektron-mode').classList.add('active');
    } else {
        document.getElementById('folder-mode-btn').classList.add('active');
        document.getElementById('folder-mode').classList.add('active');
    }

    hideProgress();
    hideDownload();
    if (document.getElementById('waveform-section')) {
        document.getElementById('waveform-section').classList.add('hidden');
    }
}

// File handlers
function handleElmultiFile(event) {
    elmultiFile = event.target.files[0];
    document.getElementById('elmulti-filename').textContent = elmultiFile ? elmultiFile.name : '';
    updateConvertButton();
}

function handleWavFile(event) {
    wavFile = event.target.files[0];
    document.getElementById('wav-filename').textContent = wavFile ? wavFile.name : '';
    updateConvertButton();
}

function handleWavFiles(event) {
    wavFiles = Array.from(event.target.files);
    document.getElementById('wav-files-count').textContent = wavFiles.length > 0 ? `${wavFiles.length} files selected` : '';
    updateConvertButton();
}

function updateConvertButton() {
    const elektronBtn = document.getElementById('convert-elektron-btn');
    const folderBtn = document.getElementById('convert-folder-btn');
    const presetName = document.getElementById('preset-name').value.trim();

    elektronBtn.disabled = !(elmultiFile && wavFile);
    folderBtn.disabled = !(wavFiles.length > 0 && presetName);
}

// Logging
function log(message) {
    const logOutput = document.getElementById('log-output');
    const div = document.createElement('div');
    div.textContent = message;
    logOutput.appendChild(div);
    logOutput.scrollTop = logOutput.scrollHeight;
}

function setProgress(percent) {
    document.getElementById('progress-fill').style.width = percent + '%';
}

function showProgress() {
    document.getElementById('progress-section').classList.remove('hidden');
    document.getElementById('log-output').innerHTML = '';
    setProgress(0);
}

function hideProgress() {
    document.getElementById('progress-section').classList.add('hidden');
}

function showDownload() {
    document.getElementById('download-section').classList.remove('hidden');
}

function hideDownload() {
    document.getElementById('download-section').classList.add('hidden');
}

// Parse .elmulti file (Elektron TOML format)
function parseElmulti(text) {
    // Extract name
    const nameMatch = text.match(/name = '(.+)'/);
    const name = nameMatch ? nameMatch[1] : "Multisample";

    // Extract key zones
    const zones = [];
    const zoneBlocks = text.split('[[key-zones]]').slice(1);

    for (const block of zoneBlocks) {
        const pitchMatch = block.match(/pitch = (\d+)/);
        if (!pitchMatch) continue;

        const pitch = parseInt(pitchMatch[1]);

        const trimStartMatch = block.match(/trim-start = (\d+)/);
        const trimEndMatch = block.match(/trim-end = (\d+)/);

        if (trimStartMatch && trimEndMatch) {
            zones.push({
                pitch: pitch,
                trim_start: parseInt(trimStartMatch[1]),
                trim_end: parseInt(trimEndMatch[1])
            });
        }
    }

    zones.sort((a, b) => a.pitch - b.pitch);
    return { name, zones };
}

// Note conversion utilities
function noteNameToMidi(noteStr) {
    const noteMap = {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
        'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };

    const match = noteStr.match(/([A-G][#b]?)(-?\d+)/i);
    if (!match) return null;

    const note = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const octave = parseInt(match[2]);

    if (!(note in noteMap)) return null;

    return (octave + 1) * 12 + noteMap[note];
}

function extractNoteFromFilename(filename) {
    const patterns = [
        /([A-G][#b]?)(-?\d+)/i,
        /_([A-G][#b]?)(-?\d+)/i,
        /\s([A-G][#b]?)(-?\d+)/i
    ];

    for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match) {
            return match[1] + match[2];
        }
    }

    return null;
}

// WAV processing
async function readWavFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    // Parse WAV header
    const riff = String.fromCharCode(dataView.getUint8(0), dataView.getUint8(1), dataView.getUint8(2), dataView.getUint8(3));
    if (riff !== 'RIFF') throw new Error('Invalid WAV file');

    const wave = String.fromCharCode(dataView.getUint8(8), dataView.getUint8(9), dataView.getUint8(10), dataView.getUint8(11));
    if (wave !== 'WAVE') throw new Error('Invalid WAV file');

    // Find fmt chunk
    let offset = 12;
    while (offset < arrayBuffer.byteLength) {
        const chunkId = String.fromCharCode(
            dataView.getUint8(offset), dataView.getUint8(offset + 1),
            dataView.getUint8(offset + 2), dataView.getUint8(offset + 3)
        );
        const chunkSize = dataView.getUint32(offset + 4, true);

        if (chunkId === 'fmt ') {
            const audioFormat = dataView.getUint16(offset + 8, true);
            const channels = dataView.getUint16(offset + 10, true);
            const sampleRate = dataView.getUint32(offset + 12, true);
            const byteRate = dataView.getUint32(offset + 16, true);
            const blockAlign = dataView.getUint16(offset + 20, true);
            const bitsPerSample = dataView.getUint16(offset + 22, true);

            return {
                arrayBuffer,
                dataView,
                audioFormat,
                channels,
                sampleRate,
                byteRate,
                blockAlign,
                bitsPerSample,
                fmtOffset: offset,
                fmtSize: chunkSize
            };
        }

        offset += 8 + chunkSize;
    }

    throw new Error('No fmt chunk found in WAV file');
}

function trimSilence(audioData, wavInfo, thresholdDb = -60) {
    const threshold = Math.pow(10, thresholdDb / 20);
    const bytesPerSample = wavInfo.bitsPerSample / 8;
    const frameSize = wavInfo.channels * bytesPerSample;
    const numFrames = Math.floor(audioData.byteLength / frameSize);

    let startFrame = 0;
    let endFrame = numFrames - 1;

    // Find start
    for (let frame = 0; frame < numFrames; frame++) {
        let maxSample = 0;
        for (let ch = 0; ch < wavInfo.channels; ch++) {
            const offset = frame * frameSize + ch * bytesPerSample;
            let sample = 0;

            if (wavInfo.bitsPerSample === 16) {
                sample = audioData.getInt16(offset, true) / 32768.0;
            } else if (wavInfo.bitsPerSample === 24) {
                const b1 = audioData.getUint8(offset);
                const b2 = audioData.getUint8(offset + 1);
                const b3 = audioData.getInt8(offset + 2);
                sample = (b1 | (b2 << 8) | (b3 << 16)) / 8388608.0;
            } else if (wavInfo.bitsPerSample === 32) {
                // Check if it's IEEE Float (format 3) or PCM integer (format 1)
                if (wavInfo.audioFormat === 3) {
                    sample = audioData.getFloat32(offset, true);
                } else {
                    sample = audioData.getInt32(offset, true) / 2147483648.0;
                }
            }

            maxSample = Math.max(maxSample, Math.abs(sample));
        }

        if (maxSample > threshold) {
            startFrame = frame;
            break;
        }
    }

    // Find end
    for (let frame = numFrames - 1; frame >= startFrame; frame--) {
        let maxSample = 0;
        for (let ch = 0; ch < wavInfo.channels; ch++) {
            const offset = frame * frameSize + ch * bytesPerSample;
            let sample = 0;

            if (wavInfo.bitsPerSample === 16) {
                sample = audioData.getInt16(offset, true) / 32768.0;
            } else if (wavInfo.bitsPerSample === 24) {
                const b1 = audioData.getUint8(offset);
                const b2 = audioData.getUint8(offset + 1);
                const b3 = audioData.getInt8(offset + 2);
                sample = (b1 | (b2 << 8) | (b3 << 16)) / 8388608.0;
            } else if (wavInfo.bitsPerSample === 32) {
                // Check if it's IEEE Float (format 3) or PCM integer (format 1)
                if (wavInfo.audioFormat === 3) {
                    sample = audioData.getFloat32(offset, true);
                } else {
                    sample = audioData.getInt32(offset, true) / 2147483648.0;
                }
            }

            maxSample = Math.max(maxSample, Math.abs(sample));
        }

        if (maxSample > threshold) {
            endFrame = frame;
            break;
        }
    }

    const trimmedSize = (endFrame - startFrame + 1) * frameSize;
    const trimmedBuffer = new ArrayBuffer(trimmedSize);
    const trimmedView = new DataView(trimmedBuffer);

    for (let i = 0; i < trimmedSize; i++) {
        trimmedView.setUint8(i, audioData.getUint8(startFrame * frameSize + i));
    }

    return { data: trimmedView, startFrame, endFrame, numFrames: endFrame - startFrame + 1 };
}

function createWavFile(audioData, wavInfo) {
    // Convert to 16-bit PCM for optimal OP-XY performance
    const outputFormat = 1; // PCM
    const outputBitsPerSample = 16;
    const bytesPerSample = wavInfo.bitsPerSample / 8;
    const frameSize = wavInfo.channels * bytesPerSample;
    const numFrames = Math.floor(audioData.byteLength / frameSize);

    // Convert audio data to 16-bit PCM
    const outputFrameSize = wavInfo.channels * 2; // 2 bytes per 16-bit sample
    const outputDataSize = numFrames * outputFrameSize;
    const outputBuffer = new ArrayBuffer(outputDataSize);
    const outputView = new DataView(outputBuffer);

    console.log('Converting to 16-bit PCM:', {
        inputFormat: wavInfo.audioFormat,
        inputBits: wavInfo.bitsPerSample,
        frames: numFrames,
        channels: wavInfo.channels
    });

    for (let frame = 0; frame < numFrames; frame++) {
        for (let ch = 0; ch < wavInfo.channels; ch++) {
            const inputOffset = frame * frameSize + ch * bytesPerSample;
            const outputOffset = frame * outputFrameSize + ch * 2;
            let sample = 0;

            // Read sample based on input format
            if (wavInfo.bitsPerSample === 16) {
                sample = audioData.getInt16(inputOffset, true) / 32768.0;
            } else if (wavInfo.bitsPerSample === 24) {
                const b1 = audioData.getUint8(inputOffset);
                const b2 = audioData.getUint8(inputOffset + 1);
                const b3 = audioData.getInt8(inputOffset + 2);
                sample = (b1 | (b2 << 8) | (b3 << 16)) / 8388608.0;
            } else if (wavInfo.bitsPerSample === 32) {
                if (wavInfo.audioFormat === 3) {
                    sample = audioData.getFloat32(inputOffset, true);
                } else {
                    sample = audioData.getInt32(inputOffset, true) / 2147483648.0;
                }
            }

            // Clamp to -1.0 to 1.0 range
            sample = Math.max(-1.0, Math.min(1.0, sample));

            // Convert to 16-bit integer
            const sample16 = Math.round(sample * 32767);
            outputView.setInt16(outputOffset, sample16, true);
        }
    }

    const headerSize = 44;
    const fileSize = headerSize + outputDataSize;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    console.log('Created 16-bit PCM WAV:', {dataSize: outputDataSize, fileSize});

    // RIFF header
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    view.setUint32(4, fileSize - 8, true);
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));

    // fmt chunk
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, outputFormat, true); // Audio format (1=PCM)
    view.setUint16(22, wavInfo.channels, true);
    view.setUint32(24, wavInfo.sampleRate, true);
    view.setUint32(28, wavInfo.sampleRate * wavInfo.channels * 2, true); // byte rate (16-bit = 2 bytes)
    view.setUint16(32, wavInfo.channels * 2, true); // block align (16-bit = 2 bytes)
    view.setUint16(34, outputBitsPerSample, true); // 16 bits per sample

    // data chunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, outputDataSize, true);

    // Copy converted audio data
    for (let i = 0; i < outputDataSize; i++) {
        view.setUint8(44 + i, outputView.getUint8(i));
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    console.log('Created WAV blob, size:', blob.size);
    return blob;
}

// Elektron conversion
async function convertElektron() {
    console.log('convertElektron called');
    showProgress();
    hideDownload();

    try {
        log('Reading .elmulti file...');
        console.log('elmultiFile:', elmultiFile);
        console.log('wavFile:', wavFile);
        const elmultiText = await elmultiFile.text();
        const elmultiData = parseElmulti(elmultiText);
        console.log('Parsed elmulti:', elmultiData);
        setProgress(10);

        log('Reading WAV file...');
        const wavInfo = await readWavFile(wavFile);
        setProgress(20);

        log('Parsing multisample data...');
        const presetName = elmultiData.name;
        const zones = elmultiData.zones;

        log(`Found ${zones.length} zones`);
        setProgress(30);

        // Find data chunk
        let dataOffset = wavInfo.fmtOffset + 8 + wavInfo.fmtSize;
        let audioDataStart = null;

        console.log('Starting search for data chunk at offset:', dataOffset);

        while (dataOffset < wavInfo.arrayBuffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                wavInfo.dataView.getUint8(dataOffset),
                wavInfo.dataView.getUint8(dataOffset + 1),
                wavInfo.dataView.getUint8(dataOffset + 2),
                wavInfo.dataView.getUint8(dataOffset + 3)
            );
            const chunkSize = wavInfo.dataView.getUint32(dataOffset + 4, true);

            console.log(`Found chunk: ${chunkId} at offset ${dataOffset}, size ${chunkSize}`);

            if (chunkId === 'data') {
                audioDataStart = dataOffset + 8;
                console.log('Data chunk found! Audio starts at:', audioDataStart);
                break;
            }

            dataOffset += 8 + chunkSize;
        }

        if (!audioDataStart) {
            throw new Error('Could not find data chunk in WAV file');
        }
        const frameSize = wavInfo.channels * wavInfo.bitsPerSample / 8;

        // Process zones - prepare for waveform editor
        waveformState.samples = [];

        for (let i = 0; i < zones.length; i++) {
            log(`Extracting zone ${i + 1}/${zones.length}...`);

            const zone = zones[i];
            const startByte = audioDataStart + zone.trim_start * frameSize;
            const endByte = audioDataStart + zone.trim_end * frameSize;
            const sliceSize = endByte - startByte;

            const sliceBuffer = new ArrayBuffer(sliceSize);
            const sliceView = new DataView(sliceBuffer);

            for (let j = 0; j < sliceSize; j++) {
                sliceView.setUint8(j, wavInfo.dataView.getUint8(startByte + j));
            }

            // Trim silence
            const trimmed = trimSilence(sliceView, wavInfo);

            const midiNote = zone.pitch;
            const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midiNote % 12];
            const octave = Math.floor(midiNote / 12) - 1;
            const fullNoteName = `${noteName}${octave}`;

            waveformState.samples.push({
                audioData: trimmed.data,
                wavInfo: wavInfo,
                note: midiNote,
                noteName: fullNoteName,
                filename: `${presetName} ${fullNoteName}.wav`,
                presetName: presetName
            });

            setProgress(30 + (i + 1) / zones.length * 60);
        }

        log('Samples extracted! Opening waveform editor...');
        setProgress(100);

        hideProgress();
        waveformState.currentIndex = 0;
        showWaveformEditor();

    } catch (error) {
        log(`ERROR: ${error.message}`);
        console.error(error);
    }
}

// Folder conversion
async function convertFolder() {
    console.log('convertFolder called');
    showProgress();
    hideDownload();

    try {
        const presetName = document.getElementById('preset-name').value.trim();
        console.log('presetName:', presetName);
        console.log('wavFiles:', wavFiles);
        log(`Processing ${wavFiles.length} WAV files...`);
        setProgress(10);

        waveformState.samples = [];
        let sampleRate = 44100;

        for (let i = 0; i < wavFiles.length; i++) {
            const file = wavFiles[i];
            log(`Processing ${file.name}...`);

            const noteName = extractNoteFromFilename(file.name);
            if (!noteName) {
                log(`WARNING: Could not extract note from ${file.name}, skipping`);
                continue;
            }

            const midiNote = noteNameToMidi(noteName);
            if (midiNote === null) {
                log(`WARNING: Invalid note name ${noteName} in ${file.name}, skipping`);
                continue;
            }

            const wavInfo = await readWavFile(file);
            sampleRate = wavInfo.sampleRate;

            // Find and trim audio data
            let dataOffset = 12;
            while (dataOffset < wavInfo.arrayBuffer.byteLength) {
                const chunkId = String.fromCharCode(
                    wavInfo.dataView.getUint8(dataOffset),
                    wavInfo.dataView.getUint8(dataOffset + 1),
                    wavInfo.dataView.getUint8(dataOffset + 2),
                    wavInfo.dataView.getUint8(dataOffset + 3)
                );
                const chunkSize = wavInfo.dataView.getUint32(dataOffset + 4, true);

                if (chunkId === 'data') {
                    break;
                }

                dataOffset += 8 + chunkSize;
            }

            const audioDataStart = dataOffset + 8;
            const audioDataSize = wavInfo.dataView.getUint32(dataOffset + 4, true);
            const audioBuffer = new ArrayBuffer(audioDataSize);
            const audioView = new DataView(audioBuffer);

            for (let j = 0; j < audioDataSize; j++) {
                audioView.setUint8(j, wavInfo.dataView.getUint8(audioDataStart + j));
            }

            const trimmed = trimSilence(audioView, wavInfo);

            waveformState.samples.push({
                audioData: trimmed.data,
                wavInfo: wavInfo,
                note: midiNote,
                noteName: noteName,
                filename: `${presetName} ${noteName}.wav`,
                presetName: presetName
            });

            setProgress(10 + (i + 1) / wavFiles.length * 80);
        }

        if (waveformState.samples.length === 0) {
            throw new Error('No valid samples found');
        }

        // Sort by MIDI note
        waveformState.samples.sort((a, b) => a.note - b.note);

        log('Samples extracted! Opening waveform editor...');
        setProgress(100);

        hideProgress();
        waveformState.currentIndex = 0;
        showWaveformEditor();

    } catch (error) {
        log(`ERROR: ${error.message}`);
        console.error(error);
    }
}

// Create OP-XY preset
async function createPreset(presetName, slices, sampleRate) {
    // Create patch.json in OP-XY format
    const regions = [];

    for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const prevNote = i > 0 ? slices[i - 1].note : 0;
        const nextNote = i < slices.length - 1 ? slices[i + 1].note : 127;

        const lokey = i === 0 ? 0 : Math.floor((prevNote + slice.note) / 2) + 1;
        const hikey = i === slices.length - 1 ? 127 : Math.floor((slice.note + nextNote) / 2);

        const framecount = slice.loopEnd;
        const loopEnd = Math.max(0, framecount - 2000);

        regions.push({
            "sample": slice.filename,
            "pitch.keycenter": slice.note,
            "lokey": lokey,
            "hikey": hikey,
            "loop.start": 0,
            "loop.end": loopEnd,
            "loop.enabled": true,
            "loop.onrelease": true,
            "loop.crossfade": 0,
            "gain": 0,
            "reverse": false,
            "sample.start": 0,
            "sample.end": framecount,
            "framecount": framecount
        });
    }

    const patch = {
        "engine": {
            "bendrange": 8191,
            "highpass": 0,
            "playmode": "poly",
            "transpose": 0,
            "portamento.amount": 0,
            "portamento.type": 32767,
            "tuning.root": 0,
            "tuning.scale": 0,
            "velocity.sensitivity": 19660,
            "volume": 18348,
            "width": 0,
            "modulation": {
                "aftertouch": {"amount": 16383, "target": 0},
                "modwheel": {"amount": 16383, "target": 0},
                "pitchbend": {"amount": 16383, "target": 0},
                "velocity": {"amount": 16383, "target": 0}
            },
            "params": [16384, 16384, 16384, 16384, 16384, 16384, 16384, 16384]
        },
        "envelope": {
            "amp": {"attack": 0, "decay": 0, "release": 25722, "sustain": 32767},
            "filter": {"attack": 0, "decay": 0, "release": 19968, "sustain": 32767}
        },
        "fx": {
            "active": true,
            "params": [32767, 0, 15009, 32767, 0, 32767, 6553, 9830],
            "type": "ladder"
        },
        "lfo": {
            "active": false,
            "params": [20309, 5679, 19114, 15807, 0, 0, 0, 12287],
            "type": "random"
        },
        "platform": "OP-XY",
        "type": "multisampler",
        "version": 4,
        "regions": regions,
        "rootFolderName": presetName
    };

    presetData = {
        presetName,
        patch,
        slices
    };
}

// Download preset
async function downloadPreset() {
    if (!presetData) return;

    const zip = new JSZip();
    const folder = zip.folder(`${presetData.presetName}.preset`);

    // Add patch.json
    folder.file('patch.json', JSON.stringify(presetData.patch, null, 2));

    // Add WAV files
    log(`Adding ${presetData.slices.length} WAV files to ZIP...`);
    for (const slice of presetData.slices) {
        console.log('Adding slice:', slice.filename, 'Blob size:', slice.blob.size);
        folder.file(slice.filename, slice.blob);
    }

    log('Creating ZIP file...');
    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });

    log(`ZIP created (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB)`);

    // Download
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presetData.presetName}.preset.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Don't revoke immediately - give browser time to download
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    log('Downloaded!');
}

// ============================================================================
// WAVEFORM EDITOR
// ============================================================================

let waveformState = {
    samples: [],           // Array of {audioData, wavInfo, note, noteName, filename, markers, reverse, crossfade}
    currentIndex: 0,
    audioContext: null,
    audioBuffer: null,
    sourceNode: null,
    canvas: null,
    ctx: null,
    zoom: 1,
    offsetX: 0,
    markers: {
        in: 0,
        out: 0,
        loopStart: 0,
        loopEnd: 0
    },
    reverse: false,
    crossfade: 0,
    isDragging: false,
    dragMarker: null
};

function showWaveformEditor() {
    console.log('showWaveformEditor called, samples:', waveformState.samples.length);
    document.getElementById('waveform-section').classList.remove('hidden');
    initWaveformEditor();
}

function hideWaveformEditor() {
    document.getElementById('waveform-section').classList.add('hidden');
}

function initWaveformEditor() {
    console.log('initWaveformEditor called');
    waveformState.canvas = document.getElementById('waveform-canvas');
    waveformState.ctx = waveformState.canvas.getContext('2d');
    console.log('Canvas:', waveformState.canvas);

    // Initialize AudioContext (lazily, on first play)
    if (!waveformState.audioContext) {
        try {
            waveformState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('AudioContext not available:', e);
        }
    }

    // Set canvas size to match display size
    const rect = waveformState.canvas.getBoundingClientRect();
    waveformState.canvas.width = rect.width * window.devicePixelRatio;
    waveformState.canvas.height = 300 * window.devicePixelRatio;
    waveformState.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Add event listeners (remove old ones first to avoid duplicates)
    const canvas = waveformState.canvas;
    const oldCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(oldCanvas, canvas);
    waveformState.canvas = oldCanvas;
    waveformState.ctx = oldCanvas.getContext('2d');
    waveformState.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    waveformState.canvas.addEventListener('mousedown', onCanvasMouseDown);
    waveformState.canvas.addEventListener('mousemove', onCanvasMouseMove);
    waveformState.canvas.addEventListener('mouseup', onCanvasMouseUp);
    waveformState.canvas.addEventListener('mouseleave', onCanvasMouseUp);

    loadCurrentSample();
}

function loadCurrentSample() {
    console.log('loadCurrentSample called, index:', waveformState.currentIndex);
    const sample = waveformState.samples[waveformState.currentIndex];
    if (!sample) {
        console.error('No sample at index', waveformState.currentIndex);
        return;
    }
    console.log('Loading sample:', sample.noteName);

    // Update UI
    document.getElementById('current-sample-info').textContent =
        `Sample ${waveformState.currentIndex + 1} of ${waveformState.samples.length} - ${sample.noteName}`;

    document.getElementById('prev-sample-btn').disabled = waveformState.currentIndex === 0;
    document.getElementById('next-sample-btn').disabled =
        waveformState.currentIndex === waveformState.samples.length - 1;

    // Initialize markers if not set
    if (!sample.markers) {
        const numFrames = Math.floor(sample.audioData.byteLength /
            (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

        sample.markers = {
            in: 0,
            out: numFrames - 1,
            loopStart: 0,
            loopEnd: Math.max(0, numFrames - 2000)
        };
    }

    // Initialize playback settings if not set
    if (sample.reverse === undefined) {
        sample.reverse = false;
    }
    if (sample.crossfade === undefined) {
        sample.crossfade = 0;
    }

    waveformState.markers = {...sample.markers};
    waveformState.reverse = sample.reverse;
    waveformState.crossfade = sample.crossfade;
    waveformState.zoom = 1;
    waveformState.offsetX = 0;

    // Update playback UI
    document.getElementById('reverse-playback').checked = waveformState.reverse;
    document.getElementById('loop-crossfade').value = waveformState.crossfade;

    // Decode audio for playback
    decodeAudioForPlayback(sample);

    // Draw waveform
    drawWaveform();
    updateMarkerInputs();
}

async function decodeAudioForPlayback(sample) {
    try {
        // Create a WAV file from the audio data
        const wavBlob = createWavFileFromData(sample.audioData, sample.wavInfo);
        const arrayBuffer = await wavBlob.arrayBuffer();
        waveformState.audioBuffer = await waveformState.audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error('Error decoding audio:', error);
    }
}

function createWavFileFromData(audioData, wavInfo) {
    const headerSize = 44;
    const fileSize = headerSize + audioData.byteLength;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // RIFF header
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    view.setUint32(4, fileSize - 8, true);
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));

    // fmt chunk
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    view.setUint32(16, 16, true);
    view.setUint16(20, wavInfo.audioFormat, true);
    view.setUint16(22, wavInfo.channels, true);
    view.setUint32(24, wavInfo.sampleRate, true);
    view.setUint32(28, wavInfo.byteRate, true);
    view.setUint16(32, wavInfo.blockAlign, true);
    view.setUint16(34, wavInfo.bitsPerSample, true);

    // data chunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, audioData.byteLength, true);

    // Copy audio data
    for (let i = 0; i < audioData.byteLength; i++) {
        view.setUint8(44 + i, audioData.getUint8(i));
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function drawWaveform() {
    const sample = waveformState.samples[waveformState.currentIndex];
    if (!sample) return;

    const canvas = waveformState.canvas;
    const ctx = waveformState.ctx;
    const width = canvas.width / window.devicePixelRatio;
    const height = 300;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    const audioData = sample.audioData;
    const wavInfo = sample.wavInfo;
    const bytesPerSample = wavInfo.bitsPerSample / 8;
    const frameSize = wavInfo.channels * bytesPerSample;
    const numFrames = Math.floor(audioData.byteLength / frameSize);

    // Calculate visible range
    const framesPerPixel = Math.ceil(numFrames / (width * waveformState.zoom));
    const startFrame = Math.floor(waveformState.offsetX * numFrames);
    const endFrame = Math.min(numFrames, startFrame + width * framesPerPixel * waveformState.zoom);

    // Draw waveform
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
        const frame = Math.floor(startFrame + x * framesPerPixel);
        if (frame >= numFrames) break;

        let maxSample = 0;
        let minSample = 0;

        // Sample multiple frames for each pixel
        for (let f = 0; f < framesPerPixel && frame + f < numFrames; f++) {
            const offset = (frame + f) * frameSize;

            // Read all channels and get max
            for (let ch = 0; ch < wavInfo.channels; ch++) {
                const chOffset = offset + ch * bytesPerSample;
                let sample = 0;

                if (wavInfo.bitsPerSample === 16) {
                    sample = audioData.getInt16(chOffset, true) / 32768.0;
                } else if (wavInfo.bitsPerSample === 24) {
                    const b1 = audioData.getUint8(chOffset);
                    const b2 = audioData.getUint8(chOffset + 1);
                    const b3 = audioData.getInt8(chOffset + 2);
                    sample = (b1 | (b2 << 8) | (b3 << 16)) / 8388608.0;
                } else if (wavInfo.bitsPerSample === 32) {
                    if (wavInfo.audioFormat === 3) {
                        sample = audioData.getFloat32(chOffset, true);
                    } else {
                        sample = audioData.getInt32(chOffset, true) / 2147483648.0;
                    }
                }

                maxSample = Math.max(maxSample, sample);
                minSample = Math.min(minSample, sample);
            }
        }

        const y1 = height / 2 + minSample * height / 2.2;
        const y2 = height / 2 + maxSample * height / 2.2;

        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
    }

    ctx.stroke();

    // Draw markers
    drawMarkers(numFrames);
}

function drawMarkers(numFrames) {
    const width = waveformState.canvas.width / window.devicePixelRatio;
    const height = 300;
    const ctx = waveformState.ctx;

    const markers = waveformState.markers;
    const startFrame = Math.floor(waveformState.offsetX * numFrames);
    const visibleFrames = numFrames / waveformState.zoom;

    function frameToX(frame) {
        return ((frame - startFrame) / visibleFrames) * width;
    }

    // Draw marker lines and labels
    const markerDefs = [
        { key: 'in', color: '#4ade80', label: 'In' },
        { key: 'out', color: '#f87171', label: 'Out' },
        { key: 'loopStart', color: '#60a5fa', label: 'Loop Start' },
        { key: 'loopEnd', color: '#a78bfa', label: 'Loop End' }
    ];

    for (const def of markerDefs) {
        const x = frameToX(markers[def.key]);
        if (x >= 0 && x <= width) {
            ctx.strokeStyle = def.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Draw label
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(x + 5, 5, ctx.measureText(def.label).width + 16, 24);
            ctx.fillStyle = 'white';
            ctx.font = '12px sans-serif';
            ctx.fillText(def.label, x + 13, 21);
        }
    }
}

function onCanvasMouseDown(e) {
    const rect = waveformState.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickedMarker = getMarkerAtX(x);

    if (clickedMarker) {
        waveformState.isDragging = true;
        waveformState.dragMarker = clickedMarker;
    }
}

function onCanvasMouseMove(e) {
    if (!waveformState.isDragging || !waveformState.dragMarker) return;

    const sample = waveformState.samples[waveformState.currentIndex];
    const numFrames = Math.floor(sample.audioData.byteLength /
        (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

    const rect = waveformState.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const startFrame = Math.floor(waveformState.offsetX * numFrames);
    const visibleFrames = numFrames / waveformState.zoom;
    const frame = Math.floor(startFrame + (x / width) * visibleFrames);

    waveformState.markers[waveformState.dragMarker] = Math.max(0, Math.min(numFrames - 1, frame));

    drawWaveform();
    updateMarkerInputs();
}

function onCanvasMouseUp() {
    waveformState.isDragging = false;
    waveformState.dragMarker = null;
}

function getMarkerAtX(x) {
    const sample = waveformState.samples[waveformState.currentIndex];
    const numFrames = Math.floor(sample.audioData.byteLength /
        (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

    const width = waveformState.canvas.width / window.devicePixelRatio;
    const startFrame = Math.floor(waveformState.offsetX * numFrames);
    const visibleFrames = numFrames / waveformState.zoom;

    function frameToX(frame) {
        return ((frame - startFrame) / visibleFrames) * width;
    }

    const threshold = 5; // pixels
    for (const key of ['in', 'out', 'loopStart', 'loopEnd']) {
        const markerX = frameToX(waveformState.markers[key]);
        if (Math.abs(x - markerX) < threshold) {
            return key;
        }
    }

    return null;
}

function updateMarkerInputs() {
    const sample = waveformState.samples[waveformState.currentIndex];
    const markers = waveformState.markers;
    const sampleRate = sample.wavInfo.sampleRate;

    document.getElementById('in-point-value').value = markers.in;
    document.getElementById('out-point-value').value = markers.out;
    document.getElementById('loop-start-value').value = markers.loopStart;
    document.getElementById('loop-end-value').value = markers.loopEnd;

    document.getElementById('in-point-time').textContent = `${(markers.in / sampleRate).toFixed(3)}s`;
    document.getElementById('out-point-time').textContent = `${(markers.out / sampleRate).toFixed(3)}s`;
    document.getElementById('loop-start-time').textContent = `${(markers.loopStart / sampleRate).toFixed(3)}s`;
    document.getElementById('loop-end-time').textContent = `${(markers.loopEnd / sampleRate).toFixed(3)}s`;

    // Set max values
    const numFrames = Math.floor(sample.audioData.byteLength /
        (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

    document.getElementById('in-point-value').max = numFrames - 1;
    document.getElementById('out-point-value').max = numFrames - 1;
    document.getElementById('loop-start-value').max = numFrames - 1;
    document.getElementById('loop-end-value').max = numFrames - 1;
}

function updateMarkerFromInput(markerKey) {
    const inputId = {
        'in': 'in-point-value',
        'out': 'out-point-value',
        'loopStart': 'loop-start-value',
        'loopEnd': 'loop-end-value'
    }[markerKey];

    const value = parseInt(document.getElementById(inputId).value);
    waveformState.markers[markerKey] = value;

    drawWaveform();
    updateMarkerInputs();
}

function prevSample() {
    // Save current markers and playback settings
    waveformState.samples[waveformState.currentIndex].markers = {...waveformState.markers};
    waveformState.samples[waveformState.currentIndex].reverse = waveformState.reverse;
    waveformState.samples[waveformState.currentIndex].crossfade = waveformState.crossfade;

    if (waveformState.currentIndex > 0) {
        waveformState.currentIndex--;
        loadCurrentSample();
    }
}

function nextSample() {
    // Save current markers and playback settings
    waveformState.samples[waveformState.currentIndex].markers = {...waveformState.markers};
    waveformState.samples[waveformState.currentIndex].reverse = waveformState.reverse;
    waveformState.samples[waveformState.currentIndex].crossfade = waveformState.crossfade;

    if (waveformState.currentIndex < waveformState.samples.length - 1) {
        waveformState.currentIndex++;
        loadCurrentSample();
    }
}

function playPreview() {
    if (!waveformState.audioBuffer) return;

    stopPreview();

    const markers = waveformState.markers;
    const sampleRate = waveformState.audioBuffer.sampleRate;
    const startTime = markers.in / sampleRate;
    const duration = (markers.out - markers.in) / sampleRate;

    waveformState.sourceNode = waveformState.audioContext.createBufferSource();
    waveformState.sourceNode.buffer = waveformState.audioBuffer;
    waveformState.sourceNode.connect(waveformState.audioContext.destination);
    waveformState.sourceNode.start(0, startTime, duration);
}

function stopPreview() {
    if (waveformState.sourceNode) {
        try {
            waveformState.sourceNode.stop();
        } catch (e) {
            // Already stopped
        }
        waveformState.sourceNode = null;
    }
}

function zoomIn() {
    waveformState.zoom = Math.min(10, waveformState.zoom * 1.5);
    drawWaveform();
}

function zoomOut() {
    waveformState.zoom = Math.max(1, waveformState.zoom / 1.5);
    waveformState.offsetX = Math.max(0, waveformState.offsetX);
    drawWaveform();
}

function resetZoom() {
    waveformState.zoom = 1;
    waveformState.offsetX = 0;
    drawWaveform();
}

function applyToAll(markerType) {
    // Save current sample's markers first
    waveformState.samples[waveformState.currentIndex].markers = {...waveformState.markers};

    const currentValue = waveformState.markers[markerType];
    const currentSample = waveformState.samples[waveformState.currentIndex];
    const currentNumFrames = Math.floor(currentSample.audioData.byteLength /
        (currentSample.wavInfo.channels * currentSample.wavInfo.bitsPerSample / 8));

    // Calculate the relative position (0.0 to 1.0)
    const relativePosition = currentValue / currentNumFrames;

    // Confirm with user
    const markerNames = {
        'in': 'In Point',
        'out': 'Out Point',
        'loopStart': 'Loop Start',
        'loopEnd': 'Loop End'
    };

    const confirmed = confirm(
        `Apply ${markerNames[markerType]} at ${(relativePosition * 100).toFixed(1)}% to all ${waveformState.samples.length} samples?\n\n` +
        `Current sample: frame ${currentValue} of ${currentNumFrames}\n` +
        `This will set the ${markerNames[markerType]} proportionally for each sample based on its length.`
    );

    if (!confirmed) return;

    // Apply to all samples
    let appliedCount = 0;
    for (let i = 0; i < waveformState.samples.length; i++) {
        const sample = waveformState.samples[i];

        // Initialize markers if not set
        if (!sample.markers) {
            const numFrames = Math.floor(sample.audioData.byteLength /
                (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

            sample.markers = {
                in: 0,
                out: numFrames - 1,
                loopStart: 0,
                loopEnd: Math.max(0, numFrames - 2000)
            };
        }

        // Calculate the frame for this sample based on relative position
        const sampleNumFrames = Math.floor(sample.audioData.byteLength /
            (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

        const newValue = Math.round(relativePosition * sampleNumFrames);
        const clampedValue = Math.max(0, Math.min(sampleNumFrames - 1, newValue));

        sample.markers[markerType] = clampedValue;
        appliedCount++;
    }

    // Reload current sample to show updated marker
    waveformState.markers = {...waveformState.samples[waveformState.currentIndex].markers};
    drawWaveform();
    updateMarkerInputs();

    console.log(`Applied ${markerNames[markerType]} to ${appliedCount} samples`);
    alert(`${markerNames[markerType]} applied to all ${appliedCount} samples!`);
}

function updatePlaybackSettings() {
    // Update current state
    waveformState.reverse = document.getElementById('reverse-playback').checked;
    waveformState.crossfade = parseInt(document.getElementById('loop-crossfade').value);

    // Save to current sample
    const sample = waveformState.samples[waveformState.currentIndex];
    sample.reverse = waveformState.reverse;
    sample.crossfade = waveformState.crossfade;

    console.log(`Updated playback: reverse=${waveformState.reverse}, crossfade=${waveformState.crossfade}`);
}

function applyPlaybackToAll(settingType) {
    // Save current sample's settings first
    updatePlaybackSettings();

    const settingNames = {
        'reverse': 'Reverse Playback',
        'crossfade': 'Loop Crossfade'
    };

    const currentValue = settingType === 'reverse' ? waveformState.reverse : waveformState.crossfade;
    const valueText = settingType === 'reverse' ?
        (currentValue ? 'ON' : 'OFF') :
        `${currentValue} frames`;

    const confirmed = confirm(
        `Apply ${settingNames[settingType]} (${valueText}) to all ${waveformState.samples.length} samples?`
    );

    if (!confirmed) return;

    // Apply to all samples
    let appliedCount = 0;
    for (let i = 0; i < waveformState.samples.length; i++) {
        const sample = waveformState.samples[i];

        if (settingType === 'reverse') {
            sample.reverse = waveformState.reverse;
        } else if (settingType === 'crossfade') {
            sample.crossfade = waveformState.crossfade;
        }

        appliedCount++;
    }

    console.log(`Applied ${settingNames[settingType]} to ${appliedCount} samples`);
    alert(`${settingNames[settingType]} applied to all ${appliedCount} samples!`);
}

async function finalizeConversion() {
    // Save current sample markers
    waveformState.samples[waveformState.currentIndex].markers = {...waveformState.markers};

    hideWaveformEditor();
    showProgress();

    try {
        log('Finalizing samples with custom markers...');
        setProgress(10);

        const processedSlices = [];
        const sample = waveformState.samples[0]; // Get first sample for preset name
        const presetName = sample.presetName || 'Preset';

        for (let i = 0; i < waveformState.samples.length; i++) {
            const sample = waveformState.samples[i];
            const markers = sample.markers;

            log(`Processing ${sample.noteName}...`);

            // Extract audio between in and out points
            const bytesPerSample = sample.wavInfo.bitsPerSample / 8;
            const frameSize = sample.wavInfo.channels * bytesPerSample;
            const startByte = markers.in * frameSize;
            const endByte = (markers.out + 1) * frameSize;
            const sliceSize = endByte - startByte;

            const sliceBuffer = new ArrayBuffer(sliceSize);
            const sliceView = new DataView(sliceBuffer);

            for (let j = 0; j < sliceSize; j++) {
                sliceView.setUint8(j, sample.audioData.getUint8(startByte + j));
            }

            // Create WAV file (with 16-bit conversion)
            const wavBlob = createWavFile(sliceView, sample.wavInfo);

            // Adjust loop points relative to the trimmed sample
            const trimmedLoopStart = Math.max(0, markers.loopStart - markers.in);
            const trimmedLoopEnd = Math.max(0, markers.loopEnd - markers.in);
            const numFrames = markers.out - markers.in + 1;

            processedSlices.push({
                note: sample.note,
                noteName: sample.noteName,
                filename: sample.filename,
                blob: wavBlob,
                loopStart: trimmedLoopStart,
                loopEnd: Math.min(trimmedLoopEnd, numFrames - 1),
                reverse: sample.reverse || false,
                crossfade: sample.crossfade || 0
            });

            setProgress(10 + (i + 1) / waveformState.samples.length * 80);
        }

        log('Creating OP-XY preset...');
        await createPresetWithLoops(presetName, processedSlices, sample.wavInfo.sampleRate);
        setProgress(100);

        log('Conversion complete!');
        showDownload();
    } catch (error) {
        log(`ERROR: ${error.message}`);
        console.error(error);
    }
}

async function createPresetWithLoops(presetName, slices, sampleRate) {
    const regions = [];

    for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const prevNote = i > 0 ? slices[i - 1].note : 0;
        const nextNote = i < slices.length - 1 ? slices[i + 1].note : 127;

        const lokey = i === 0 ? 0 : Math.floor((prevNote + slice.note) / 2) + 1;
        const hikey = i === slices.length - 1 ? 127 : Math.floor((slice.note + nextNote) / 2);

        const framecount = Math.floor((slice.blob.size - 44) / (2 * 2)); // 16-bit stereo assumption

        regions.push({
            "sample": slice.filename,
            "pitch.keycenter": slice.note,
            "lokey": lokey,
            "hikey": hikey,
            "loop.start": slice.loopStart,
            "loop.end": slice.loopEnd,
            "loop.enabled": true,
            "loop.onrelease": true,
            "loop.crossfade": slice.crossfade,
            "gain": 0,
            "reverse": slice.reverse,
            "sample.start": 0,
            "sample.end": framecount,
            "framecount": framecount
        });
    }

    const patch = {
        "engine": {
            "bendrange": 8191,
            "highpass": 0,
            "playmode": "poly",
            "transpose": 0,
            "portamento.amount": 0,
            "portamento.type": 32767,
            "tuning.root": 0,
            "tuning.scale": 0,
            "velocity.sensitivity": 19660,
            "volume": 18348,
            "width": 0,
            "modulation": {
                "aftertouch": {"amount": 16383, "target": 0},
                "modwheel": {"amount": 16383, "target": 0},
                "pitchbend": {"amount": 16383, "target": 0},
                "velocity": {"amount": 16383, "target": 0}
            },
            "params": [16384, 16384, 16384, 16384, 16384, 16384, 16384, 16384]
        },
        "envelope": {
            "amp": {"attack": 0, "decay": 0, "release": 25722, "sustain": 32767},
            "filter": {"attack": 0, "decay": 0, "release": 19968, "sustain": 32767}
        },
        "fx": {
            "active": true,
            "params": [32767, 0, 15009, 32767, 0, 32767, 6553, 9830],
            "type": "ladder"
        },
        "lfo": {
            "active": false,
            "params": [20309, 5679, 19114, 15807, 0, 0, 0, 12287],
            "type": "random"
        },
        "platform": "OP-XY",
        "type": "multisampler",
        "version": 4,
        "regions": regions,
        "rootFolderName": presetName
    };

    presetData = {
        presetName,
        patch,
        slices
    };
}
