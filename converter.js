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
function handleElektronFolder(event) {
    const files = Array.from(event.target.files);

    // Find .elmulti and .wav files
    elmultiFile = files.find(f => f.name.toLowerCase().endsWith('.elmulti'));
    wavFile = files.find(f => f.name.toLowerCase().endsWith('.wav'));

    const infoSpan = document.getElementById('elektron-folder-info');

    if (elmultiFile && wavFile) {
        infoSpan.textContent = `✓ Found: ${elmultiFile.name} and ${wavFile.name}`;
        infoSpan.style.color = '#10b981';
    } else if (elmultiFile) {
        infoSpan.textContent = `⚠ Found .elmulti but missing .wav file`;
        infoSpan.style.color = '#f59e0b';
    } else if (wavFile) {
        infoSpan.textContent = `⚠ Found .wav but missing .elmulti file`;
        infoSpan.style.color = '#f59e0b';
    } else {
        infoSpan.textContent = `✗ No .elmulti or .wav files found in this folder`;
        infoSpan.style.color = '#ef4444';
    }

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

// Show toast notification for user actions
function showToast(message, duration = 3000) {
    // Remove any existing toast
    const existingToast = document.querySelector('.status-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'status-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
        toast.remove();
    }, duration);
}

// Add visual feedback to button clicks
function addButtonFeedback(button) {
    button.classList.add('button-clicked');
    setTimeout(() => {
        button.classList.remove('button-clicked');
    }, 400);
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

    // Log the complete patch for debugging
    console.log('=== GENERATED PATCH.JSON ===');
    console.log(JSON.stringify(patch, null, 2));
    console.log('=== REGIONS SUMMARY ===');
    regions.forEach((region, i) => {
        console.log(`Region ${i}: crossfade=${region['loop.crossfade']}, gain=${region.gain}, tune=${region.tune}, reverse=${region.reverse}`);
    });
}

// Download preset
function downloadPatchJson() {
    if (!presetData) {
        alert('No preset data available. Please convert samples first.');
        return;
    }

    const jsonString = JSON.stringify(presetData.patch, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presetData.presetName}_patch.json`;
    a.click();
    URL.revokeObjectURL(url);

    log('Downloaded patch.json for debugging');
}

async function downloadPreset() {
    if (!presetData) return;

    const zip = new JSZip();
    const folder = zip.folder(`${presetData.presetName}.preset`);
    const now = new Date();

    // Add patch.json with current timestamp
    const patchJson = JSON.stringify(presetData.patch, null, 2);
    console.log('Patch JSON being added to ZIP:', patchJson);
    folder.file('patch.json', patchJson, { date: now });

    // Add WAV files with current timestamp
    log(`Adding ${presetData.slices.length} WAV files to ZIP...`);
    for (const slice of presetData.slices) {
        console.log('Adding slice:', slice.filename, 'Blob size:', slice.blob.size);
        folder.file(slice.filename, slice.blob, { date: now });
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
    samples: [],           // Array of {audioData, wavInfo, note, noteName, filename, markers, reverse, crossfade, gain, tune}
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
    gain: 0,
    tune: 0,
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
            loopEnd: numFrames - 1
        };
    }

    // Initialize playback settings if not set
    if (sample.reverse === undefined) {
        sample.reverse = false;
    }
    if (sample.crossfade === undefined) {
        sample.crossfade = 0;
    }
    if (sample.gain === undefined) {
        sample.gain = 0;
    }
    if (sample.tune === undefined) {
        sample.tune = 0;
    }

    waveformState.markers = {...sample.markers};
    waveformState.reverse = sample.reverse;
    waveformState.crossfade = sample.crossfade;
    waveformState.gain = sample.gain;
    waveformState.tune = sample.tune;
    waveformState.zoom = 1;
    waveformState.offsetX = 0;

    // Update playback UI
    document.getElementById('reverse-playback').checked = waveformState.reverse;
    document.getElementById('loop-crossfade-slider').value = waveformState.crossfade;
    document.getElementById('sample-gain-slider').value = waveformState.gain;
    document.getElementById('sample-tune-slider').value = waveformState.tune;
    document.getElementById('crossfade-display').textContent = `${waveformState.crossfade}%`;
    document.getElementById('gain-display').textContent = `${waveformState.gain.toFixed(1)} dB`;
    document.getElementById('tune-display').textContent = `${waveformState.tune} cents`;

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

        // Apply gain scaling for visual feedback (convert dB to linear)
        const gainMultiplier = Math.pow(10, waveformState.gain / 20);
        maxSample *= gainMultiplier;
        minSample *= gainMultiplier;

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

    // Draw corner handles
    const handleSize = 20;
    const handleDefs = [
        { key: 'in', x: frameToX(markers.in), y: 0, color: '#4ade80', label: 'IN' },
        { key: 'out', x: frameToX(markers.out), y: 0, color: '#f87171', label: 'OUT' },
        { key: 'loopStart', x: frameToX(markers.loopStart), y: height - handleSize, color: '#60a5fa', label: 'LS' },
        { key: 'loopEnd', x: frameToX(markers.loopEnd), y: height - handleSize, color: '#a78bfa', label: 'LE' }
    ];

    for (const handle of handleDefs) {
        if (handle.x >= 0 && handle.x <= width) {
            // Draw handle rectangle
            ctx.fillStyle = handle.color;
            ctx.fillRect(handle.x - handleSize / 2, handle.y, handleSize, handleSize);

            // Draw handle border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(handle.x - handleSize / 2, handle.y, handleSize, handleSize);

            // Draw label text
            ctx.fillStyle = '#000';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(handle.label, handle.x, handle.y + handleSize / 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }
    }

    // Draw crossfade visualization as diagonal line (\)
    // Line goes from bottom-right to top, extending left based on crossfade percentage
    const crossfadePercentage = waveformState.crossfade / 100;
    const crossfadeWidth = width * crossfadePercentage; // 100% crossfade = full width

    // Draw diagonal crossfade line (from bottom-right to top-left)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 3]); // Dashed line
    ctx.beginPath();
    ctx.moveTo(width, height); // Bottom-right corner
    ctx.lineTo(width - crossfadeWidth, 0); // Extends left to top based on percentage
    ctx.stroke();
    ctx.setLineDash([]); // Reset to solid line

    // Draw crossfade handle at the middle of the diagonal line
    const crossfadeHandleSize = 30;
    const crossfadeHandleX = width - crossfadeWidth / 2;
    const crossfadeHandleY = height / 2 - crossfadeHandleSize / 2;

    // Draw crossfade handle rectangle
    ctx.fillStyle = '#f59e0b'; // Orange color
    ctx.fillRect(crossfadeHandleX - crossfadeHandleSize / 2, crossfadeHandleY, crossfadeHandleSize, crossfadeHandleSize);

    // Draw handle border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(crossfadeHandleX - crossfadeHandleSize / 2, crossfadeHandleY, crossfadeHandleSize, crossfadeHandleSize);

    // Draw crossfade percentage text
    ctx.fillStyle = '#000';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${waveformState.crossfade}%`, crossfadeHandleX, crossfadeHandleY + crossfadeHandleSize / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Draw tune indicator in top-left corner if not zero
    if (waveformState.tune !== 0) {
        const tuneText = `Tune: ${waveformState.tune > 0 ? '+' : ''}${waveformState.tune} cents`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(5, 35, ctx.measureText(tuneText).width + 16, 24);
        ctx.fillStyle = '#fbbf24'; // Yellow color for tune
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(tuneText, 13, 51);
    }
}

function onCanvasMouseDown(e) {
    const rect = waveformState.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const clickedMarker = getMarkerAtPosition(x, y);

    if (clickedMarker) {
        waveformState.isDragging = true;
        waveformState.dragMarker = clickedMarker;
    }
}

function onCanvasMouseMove(e) {
    const rect = waveformState.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (waveformState.isDragging && waveformState.dragMarker) {
        if (waveformState.dragMarker === 'crossfade') {
            // Horizontal drag for crossfade (100% at left edge, 0% at right edge)
            const width = rect.width;
            const distanceFromRight = width - x;
            const percentage = Math.max(0, Math.min(100, Math.round((1 - distanceFromRight / width) * 100)));
            waveformState.crossfade = percentage;

            // Update slider and display
            document.getElementById('loop-crossfade-slider').value = percentage;
            document.getElementById('crossfade-display').textContent = `${percentage}%`;

            drawWaveform();
        } else {
            // Horizontal drag for markers
            const sample = waveformState.samples[waveformState.currentIndex];
            const numFrames = Math.floor(sample.audioData.byteLength /
                (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

            const width = rect.width;

            const startFrame = Math.floor(waveformState.offsetX * numFrames);
            const visibleFrames = numFrames / waveformState.zoom;
            const frame = Math.floor(startFrame + (x / width) * visibleFrames);

            waveformState.markers[waveformState.dragMarker] = Math.max(0, Math.min(numFrames - 1, frame));

            drawWaveform();
            updateMarkerInputs();
        }
    } else {
        // Update cursor based on hover
        const markerAtPos = getMarkerAtPosition(x, y);
        if (markerAtPos === 'crossfade') {
            waveformState.canvas.style.cursor = 'ew-resize';
        } else if (markerAtPos) {
            waveformState.canvas.style.cursor = 'ew-resize';
        } else {
            waveformState.canvas.style.cursor = 'default';
        }
    }
}

function onCanvasMouseUp() {
    waveformState.isDragging = false;
    waveformState.dragMarker = null;
}

function getMarkerAtPosition(x, y) {
    const sample = waveformState.samples[waveformState.currentIndex];
    const numFrames = Math.floor(sample.audioData.byteLength /
        (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

    const width = waveformState.canvas.width / window.devicePixelRatio;
    const height = 300;
    const startFrame = Math.floor(waveformState.offsetX * numFrames);
    const visibleFrames = numFrames / waveformState.zoom;

    function frameToX(frame) {
        return ((frame - startFrame) / visibleFrames) * width;
    }

    const handleSize = 20;

    // Check crossfade handle first (positioned at middle of diagonal line)
    const crossfadePercentage = waveformState.crossfade / 100;
    const crossfadeWidth = width * crossfadePercentage;
    const crossfadeHandleSize = 30;
    const crossfadeHandleX = width - crossfadeWidth / 2;
    const crossfadeHandleY = height / 2 - crossfadeHandleSize / 2;

    if (x >= crossfadeHandleX - crossfadeHandleSize / 2 && x <= crossfadeHandleX + crossfadeHandleSize / 2 &&
        y >= crossfadeHandleY && y <= crossfadeHandleY + crossfadeHandleSize) {
        return 'crossfade';
    }

    // Check handles (priority over marker lines)
    const handleDefs = [
        { key: 'in', x: frameToX(waveformState.markers.in), y: 0 },
        { key: 'out', x: frameToX(waveformState.markers.out), y: 0 },
        { key: 'loopStart', x: frameToX(waveformState.markers.loopStart), y: height - handleSize },
        { key: 'loopEnd', x: frameToX(waveformState.markers.loopEnd), y: height - handleSize }
    ];

    for (const handle of handleDefs) {
        if (x >= handle.x - handleSize / 2 && x <= handle.x + handleSize / 2 &&
            y >= handle.y && y <= handle.y + handleSize) {
            return handle.key;
        }
    }

    // Fallback to marker line detection
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
    waveformState.samples[waveformState.currentIndex].gain = waveformState.gain;
    waveformState.samples[waveformState.currentIndex].tune = waveformState.tune;

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
    waveformState.samples[waveformState.currentIndex].gain = waveformState.gain;
    waveformState.samples[waveformState.currentIndex].tune = waveformState.tune;

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

function resetToInitial() {
    const sample = waveformState.samples[waveformState.currentIndex];
    const numFrames = Math.floor(sample.audioData.byteLength /
        (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

    // Reset to initial auto-detected settings
    sample.markers = {
        in: 0,
        out: numFrames - 1,
        loopStart: 0,
        loopEnd: numFrames - 1
    };
    sample.reverse = false;
    sample.crossfade = 0;
    sample.gain = 0;
    sample.tune = 0;

    // Update state
    waveformState.markers = {...sample.markers};
    waveformState.reverse = sample.reverse;
    waveformState.crossfade = sample.crossfade;
    waveformState.gain = sample.gain;
    waveformState.tune = sample.tune;

    // Update UI
    document.getElementById('reverse-playback').checked = false;
    document.getElementById('loop-crossfade-slider').value = 0;
    document.getElementById('sample-gain-slider').value = 0;
    document.getElementById('sample-tune-slider').value = 0;
    document.getElementById('crossfade-display').textContent = '0 frames';
    document.getElementById('gain-display').textContent = '0.0 dB';
    document.getElementById('tune-display').textContent = '0 cents';

    // Redraw
    drawWaveform();
    updateMarkerInputs();

    log(`Reset sample ${sample.noteName} to initial settings`);
    showToast(`✓ Reset ${sample.noteName} to initial settings`);
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

    const markerNames = {
        'in': 'In Point',
        'out': 'Out Point',
        'loopStart': 'Loop Start',
        'loopEnd': 'Loop End'
    };

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
                loopEnd: numFrames - 1
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

    log(`Applied ${markerNames[markerType]} to ${appliedCount} samples`);
    showToast(`✓ ${markerNames[markerType]} applied to all ${appliedCount} samples`);
}

function updateSlider(settingType) {
    // Get value from slider
    let value;
    switch (settingType) {
        case 'crossfade':
            value = parseInt(document.getElementById('loop-crossfade-slider').value);
            waveformState.crossfade = value;
            document.getElementById('crossfade-display').textContent = `${value}%`;
            break;
        case 'gain':
            value = parseFloat(document.getElementById('sample-gain-slider').value);
            waveformState.gain = value;
            document.getElementById('gain-display').textContent = `${value.toFixed(1)} dB`;
            break;
        case 'tune':
            value = parseInt(document.getElementById('sample-tune-slider').value);
            waveformState.tune = value;
            document.getElementById('tune-display').textContent = `${value} cents`;
            break;
    }

    // Save to current sample
    const sample = waveformState.samples[waveformState.currentIndex];
    sample.crossfade = waveformState.crossfade;
    sample.gain = waveformState.gain;
    sample.tune = waveformState.tune;

    // Redraw waveform to show visual changes
    drawWaveform();
}

function updatePlaybackSettings() {
    // Update current state
    waveformState.reverse = document.getElementById('reverse-playback').checked;
    waveformState.crossfade = parseInt(document.getElementById('loop-crossfade-slider').value);
    waveformState.gain = parseFloat(document.getElementById('sample-gain-slider').value);
    waveformState.tune = parseInt(document.getElementById('sample-tune-slider').value);

    // Update displays
    document.getElementById('crossfade-display').textContent = `${waveformState.crossfade}%`;
    document.getElementById('gain-display').textContent = `${waveformState.gain.toFixed(1)} dB`;
    document.getElementById('tune-display').textContent = `${waveformState.tune} cents`;

    // Save to current sample
    const sample = waveformState.samples[waveformState.currentIndex];
    sample.reverse = waveformState.reverse;
    sample.crossfade = waveformState.crossfade;
    sample.gain = waveformState.gain;
    sample.tune = waveformState.tune;

    console.log(`Updated playback: reverse=${waveformState.reverse}, crossfade=${waveformState.crossfade}, gain=${waveformState.gain}dB, tune=${waveformState.tune}cents`);
}

function applyPlaybackToAll(settingType) {
    // Save current sample's settings first
    updatePlaybackSettings();

    const settingNames = {
        'reverse': 'Reverse Playback',
        'crossfade': 'Loop Crossfade',
        'gain': 'Gain',
        'tune': 'Tuning'
    };

    let currentValue, valueText;

    switch (settingType) {
        case 'reverse':
            currentValue = waveformState.reverse;
            valueText = currentValue ? 'ON' : 'OFF';
            break;
        case 'crossfade':
            currentValue = waveformState.crossfade;
            valueText = `${currentValue}%`;
            break;
        case 'gain':
            currentValue = waveformState.gain;
            valueText = `${currentValue.toFixed(1)} dB`;
            break;
        case 'tune':
            currentValue = waveformState.tune;
            valueText = `${currentValue} cents`;
            break;
    }

    // Apply to all samples
    let appliedCount = 0;
    for (let i = 0; i < waveformState.samples.length; i++) {
        const sample = waveformState.samples[i];

        switch (settingType) {
            case 'reverse':
                sample.reverse = waveformState.reverse;
                break;
            case 'crossfade':
                sample.crossfade = waveformState.crossfade;
                break;
            case 'gain':
                sample.gain = waveformState.gain;
                break;
            case 'tune':
                sample.tune = waveformState.tune;
                break;
        }

        appliedCount++;
    }

    log(`Applied ${settingNames[settingType]} (${valueText}) to ${appliedCount} samples`);
    showToast(`✓ ${settingNames[settingType]} (${valueText}) applied to all samples`);
}

function applyGradient(settingType, curveType) {
    const numSamples = waveformState.samples.length;

    // Define ranges for each setting type
    const ranges = {
        'crossfade': { min: 0, max: 100 },
        'gain': { min: -12, max: 6 },
        'tune': { min: -50, max: 50 }
    };

    const range = ranges[settingType];
    if (!range) return;

    for (let i = 0; i < numSamples; i++) {
        const sample = waveformState.samples[i];
        const t = i / (numSamples - 1 || 1); // Normalized position (0 to 1)

        let value;

        switch (curveType) {
            case 'linear':
                // Linear fade from min to max
                value = range.min + t * (range.max - range.min);
                break;

            case 'reverse':
                // Reverse linear fade from max to min
                value = range.max - t * (range.max - range.min);
                break;

            case 'exp':
                // Exponential curve
                const expT = Math.pow(t, 2);
                value = range.min + expT * (range.max - range.min);
                break;

            case 'wave':
                // Sine wave pattern
                const waveT = Math.sin(t * Math.PI * 4);
                value = waveT * (range.max - range.min) / 2;
                break;
        }

        // Apply value based on setting type
        switch (settingType) {
            case 'crossfade':
                sample.crossfade = Math.round(value);
                break;
            case 'gain':
                sample.gain = parseFloat(value.toFixed(1));
                break;
            case 'tune':
                sample.tune = Math.round(value);
                break;
        }
    }

    // Reload current sample to show updated value
    const currentSample = waveformState.samples[waveformState.currentIndex];
    waveformState.crossfade = currentSample.crossfade;
    waveformState.gain = currentSample.gain;
    waveformState.tune = currentSample.tune;

    // Update UI
    document.getElementById('loop-crossfade-slider').value = waveformState.crossfade;
    document.getElementById('sample-gain-slider').value = waveformState.gain;
    document.getElementById('sample-tune-slider').value = waveformState.tune;
    document.getElementById('crossfade-display').textContent = `${waveformState.crossfade}%`;
    document.getElementById('gain-display').textContent = `${waveformState.gain.toFixed(1)} dB`;
    document.getElementById('tune-display').textContent = `${waveformState.tune} cents`;

    const curveNames = {
        'linear': 'Linear Fade In',
        'reverse': 'Linear Fade Out',
        'exp': 'Exponential Curve',
        'wave': 'Wave Pattern'
    };

    log(`Applied ${curveType} gradient to ${settingType} across ${numSamples} samples`);
    showToast(`✓ ${curveNames[curveType]} applied to ${settingType}`);
}

function randomizeAll(settingType) {
    const numSamples = waveformState.samples.length;

    // Define ranges and variation for each setting type
    const configs = {
        'crossfade': { base: 50, variation: 50, round: true },
        'gain': { base: 0, variation: 3, round: false },
        'tune': { base: 0, variation: 10, round: true }
    };

    const config = configs[settingType];
    if (!config) return;

    for (let i = 0; i < numSamples; i++) {
        const sample = waveformState.samples[i];

        // Random value with +/- variation around base
        const randomValue = config.base + (Math.random() * 2 - 1) * config.variation;
        const value = config.round ? Math.round(randomValue) : parseFloat(randomValue.toFixed(1));

        // Apply value based on setting type
        switch (settingType) {
            case 'crossfade':
                sample.crossfade = Math.max(0, value);
                break;
            case 'gain':
                sample.gain = value;
                break;
            case 'tune':
                sample.tune = value;
                break;
        }
    }

    // Reload current sample to show updated value
    const currentSample = waveformState.samples[waveformState.currentIndex];
    waveformState.crossfade = currentSample.crossfade;
    waveformState.gain = currentSample.gain;
    waveformState.tune = currentSample.tune;

    // Update UI
    document.getElementById('loop-crossfade-slider').value = waveformState.crossfade;
    document.getElementById('sample-gain-slider').value = waveformState.gain;
    document.getElementById('sample-tune-slider').value = waveformState.tune;
    document.getElementById('crossfade-display').textContent = `${waveformState.crossfade}%`;
    document.getElementById('gain-display').textContent = `${waveformState.gain.toFixed(1)} dB`;
    document.getElementById('tune-display').textContent = `${waveformState.tune} cents`;

    log(`Randomized ${settingType} across ${numSamples} samples`);
    showToast(`✓ Randomized ${settingType} across all samples`);
}

function applyReichPhasing(intensity) {
    const numSamples = waveformState.samples.length;

    // Phase shift configurations
    const configs = {
        'subtle': { loopShift: 50, inShift: 20, detuneRange: 3 },
        'moderate': { loopShift: 200, inShift: 100, detuneRange: 8 },
        'extreme': { loopShift: 500, inShift: 300, detuneRange: 15 },
        'poly': { loopShift: 300, inShift: 150, detuneRange: 12, useGoldenRatio: true }
    };

    const config = configs[intensity];
    if (!config) return;

    for (let i = 0; i < numSamples; i++) {
        const sample = waveformState.samples[i];
        const numFrames = Math.floor(sample.audioData.byteLength /
            (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

        // Initialize markers if not set
        if (!sample.markers) {
            sample.markers = {
                in: 0,
                out: numFrames - 1,
                loopStart: 0,
                loopEnd: numFrames - 1
            };
        }

        // Calculate phase shift for this sample
        let phaseRatio;
        if (config.useGoldenRatio) {
            // Use golden ratio for polyrhythmic phasing (like Reich's "Piano Phase")
            const goldenRatio = (1 + Math.sqrt(5)) / 2;
            phaseRatio = (i * goldenRatio) % 1;
        } else {
            // Linear accumulating phase shift
            phaseRatio = i / (numSamples - 1 || 1);
        }

        // Apply gradual shift to loop points
        const loopShiftFrames = Math.round(phaseRatio * config.loopShift);
        const inShiftFrames = Math.round(phaseRatio * config.inShift);

        // Shift loop start and end (wrapping around)
        const originalLoopLength = sample.markers.loopEnd - sample.markers.loopStart;
        sample.markers.loopStart = Math.min(
            numFrames - originalLoopLength - 1,
            Math.max(0, sample.markers.loopStart + loopShiftFrames)
        );
        sample.markers.loopEnd = Math.min(
            numFrames - 1,
            sample.markers.loopStart + originalLoopLength
        );

        // Subtle in-point shift for additional texture
        sample.markers.in = Math.min(
            sample.markers.out - 1000,
            Math.max(0, inShiftFrames)
        );

        // Add slight detuning that accumulates (Reich-style drift)
        const detuneAmount = (phaseRatio - 0.5) * config.detuneRange * 2;
        sample.tune = Math.round(detuneAmount);

        // Subtle crossfade variation for smoother phasing
        sample.crossfade = Math.round(100 + phaseRatio * 400);
    }

    // Reload current sample to show updated values
    const currentSample = waveformState.samples[waveformState.currentIndex];
    waveformState.markers = {...currentSample.markers};
    waveformState.tune = currentSample.tune;
    waveformState.crossfade = currentSample.crossfade;

    // Update UI
    document.getElementById('loop-crossfade-slider').value = waveformState.crossfade;
    document.getElementById('sample-tune-slider').value = waveformState.tune;
    document.getElementById('crossfade-display').textContent = `${waveformState.crossfade}%`;
    document.getElementById('tune-display').textContent = `${waveformState.tune} cents`;

    // Redraw
    drawWaveform();
    updateMarkerInputs();

    const modeNames = {
        'subtle': 'Subtle',
        'moderate': 'Moderate',
        'extreme': 'Extreme',
        'poly': 'Polyrhythmic'
    };

    log(`Applied ${modeNames[intensity]} Steve Reich phasing across ${numSamples} samples`);
    showToast(`✓ ${modeNames[intensity]} Reich Phasing applied`);
}

function updateReichSlider() {
    const value = parseInt(document.getElementById('reich-increment-slider').value);
    document.getElementById('reich-increment-display').textContent = `${value}%`;
}

function applyReichIncremental() {
    const increment = parseInt(document.getElementById('reich-increment-slider').value);
    const numSamples = waveformState.samples.length;

    for (let i = 0; i < numSamples; i++) {
        const sample = waveformState.samples[i];
        const numFrames = Math.floor(sample.audioData.byteLength /
            (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

        // Initialize markers if not set
        if (!sample.markers) {
            sample.markers = {
                in: 0,
                out: numFrames - 1,
                loopStart: 0,
                loopEnd: numFrames - 1
            };
        }

        // Calculate cumulative shift: sample 0 = +0, sample 1 = +increment, sample 2 = +2*increment, etc.
        const shiftFrames = i * increment;

        // Get original loop length to preserve it
        const originalLoopLength = sample.markers.loopEnd - sample.markers.loopStart;

        // Shift loop start forward by cumulative amount, wrapping if needed
        let newLoopStart = sample.markers.loopStart + shiftFrames;

        // Wrap around if we exceed the sample length
        while (newLoopStart > numFrames - originalLoopLength - 100) {
            newLoopStart -= originalLoopLength;
        }

        sample.markers.loopStart = Math.max(0, Math.min(numFrames - originalLoopLength - 1, newLoopStart));
        sample.markers.loopEnd = Math.min(numFrames - 1, sample.markers.loopStart + originalLoopLength);
    }

    // Reload current sample to show updated values
    const currentSample = waveformState.samples[waveformState.currentIndex];
    waveformState.markers = {...currentSample.markers};

    // Redraw
    drawWaveform();
    updateMarkerInputs();

    log(`Applied incremental Reich phasing: +${increment} frames per sample across ${numSamples} samples`);
    showToast(`✓ Incremental Phasing: +${increment} frames per sample`);
}

async function finalizeConversion() {
    // Save current sample markers and settings
    waveformState.samples[waveformState.currentIndex].markers = {...waveformState.markers};
    waveformState.samples[waveformState.currentIndex].reverse = waveformState.reverse;
    waveformState.samples[waveformState.currentIndex].crossfade = waveformState.crossfade;
    waveformState.samples[waveformState.currentIndex].gain = waveformState.gain;
    waveformState.samples[waveformState.currentIndex].tune = waveformState.tune;

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

            // Initialize markers if not set (for samples that weren't manually edited)
            if (!sample.markers) {
                const numFrames = Math.floor(sample.audioData.byteLength /
                    (sample.wavInfo.channels * sample.wavInfo.bitsPerSample / 8));

                sample.markers = {
                    in: 0,
                    out: numFrames - 1,
                    loopStart: 0,
                    loopEnd: numFrames - 1
                };
            }

            // Initialize playback settings if not set
            if (sample.reverse === undefined) sample.reverse = false;
            if (sample.crossfade === undefined) sample.crossfade = 0;
            if (sample.gain === undefined) sample.gain = 0;
            if (sample.tune === undefined) sample.tune = 0;

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

            // Calculate actual framecount from the WAV blob we just created
            // Format is 16-bit (2 bytes) * channels
            const actualFramecount = Math.floor((wavBlob.size - 44) / (2 * sample.wavInfo.channels));

            // Ensure loop end goes to the actual end of the sample
            const finalLoopEnd = Math.min(trimmedLoopEnd, actualFramecount - 1);

            console.log(`Sample ${sample.noteName}: actualFramecount=${actualFramecount}, trimmedLoopEnd=${trimmedLoopEnd}, finalLoopEnd=${finalLoopEnd}`);

            processedSlices.push({
                note: sample.note,
                noteName: sample.noteName,
                filename: sample.filename,
                blob: wavBlob,
                channels: sample.wavInfo.channels,
                loopStart: trimmedLoopStart,
                loopEnd: finalLoopEnd,
                reverse: sample.reverse || false,
                crossfade: sample.crossfade || 0,
                gain: sample.gain || 0,
                tune: sample.tune || 0
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

        // Calculate framecount based on actual channel count (16-bit = 2 bytes per sample)
        const framecount = Math.floor((slice.blob.size - 44) / (2 * slice.channels));

        // Calculate loop length in frames
        const loopLength = slice.loopEnd - slice.loopStart;

        // Convert crossfade percentage to actual frames
        // Crossfade is a percentage of the loop length
        const crossfadeFrames = Math.round((slice.crossfade / 100) * loopLength);

        // Log the settings for debugging
        console.log(`Region ${slice.noteName}: channels=${slice.channels}, framecount=${framecount}, loopLength=${loopLength}, crossfade=${slice.crossfade}% -> ${crossfadeFrames} frames`);

        regions.push({
            "sample": slice.filename,
            "pitch.keycenter": slice.note,
            "lokey": lokey,
            "hikey": hikey,
            "loop.start": slice.loopStart,
            "loop.end": slice.loopEnd,
            "loop.enabled": true,
            "loop.onrelease": true,
            "loop.crossfade": crossfadeFrames,
            "gain": slice.gain,
            "tune": slice.tune,
            "reverse": slice.reverse,
            "sample.start": 0,
            "sample.end": framecount - 1,
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

    // Log the complete patch for debugging
    console.log('=== GENERATED PATCH.JSON ===');
    console.log(JSON.stringify(patch, null, 2));
    console.log('=== REGIONS SUMMARY ===');
    regions.forEach((region, i) => {
        console.log(`Region ${i}: crossfade=${region['loop.crossfade']}, gain=${region.gain}, tune=${region.tune}, reverse=${region.reverse}`);
    });
}
