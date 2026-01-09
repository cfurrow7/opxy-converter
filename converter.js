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
    const dataSize = audioData.byteLength;
    const headerSize = 44;
    const fileSize = headerSize + dataSize;

    console.log('Creating WAV:', {dataSize, fileSize, channels: wavInfo.channels, sampleRate: wavInfo.sampleRate, bitsPerSample: wavInfo.bitsPerSample});

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
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, wavInfo.audioFormat, true); // Audio format (1=PCM, 3=IEEE Float)
    view.setUint16(22, wavInfo.channels, true);
    view.setUint32(24, wavInfo.sampleRate, true);
    view.setUint32(28, wavInfo.byteRate, true); // byte rate
    view.setUint16(32, wavInfo.blockAlign, true); // block align
    view.setUint16(34, wavInfo.bitsPerSample, true);

    // data chunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, dataSize, true);

    // Copy audio data
    for (let i = 0; i < dataSize; i++) {
        view.setUint8(44 + i, audioData.getUint8(i));
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    console.log('Created WAV blob, size:', blob.size);
    return blob;
}

// Elektron conversion
async function convertElektron() {
    showProgress();
    hideDownload();

    try {
        log('Reading .elmulti file...');
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

        // Process zones
        const processedSlices = [];

        for (let i = 0; i < zones.length; i++) {
            log(`Processing zone ${i + 1}/${zones.length}...`);

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
            const wavBlob = createWavFile(trimmed.data, wavInfo);

            const midiNote = zone.pitch;
            const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midiNote % 12];
            const octave = Math.floor(midiNote / 12) - 1;
            const fullNoteName = `${noteName}${octave}`;

            processedSlices.push({
                note: midiNote,
                noteName: fullNoteName,
                filename: `${presetName} ${fullNoteName}.wav`,
                blob: wavBlob,
                loopEnd: trimmed.numFrames
            });

            setProgress(30 + (i + 1) / zones.length * 50);
        }

        log('Creating OP-XY preset...');
        await createPreset(presetName, processedSlices, wavInfo.sampleRate);
        setProgress(100);

        log('Conversion complete!');
        showDownload();

    } catch (error) {
        log(`ERROR: ${error.message}`);
        console.error(error);
    }
}

// Folder conversion
async function convertFolder() {
    showProgress();
    hideDownload();

    try {
        const presetName = document.getElementById('preset-name').value.trim();
        log(`Processing ${wavFiles.length} WAV files...`);
        setProgress(10);

        const processedSlices = [];
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
            const wavBlob = createWavFile(trimmed.data, wavInfo);

            processedSlices.push({
                note: midiNote,
                noteName: noteName,
                filename: `${presetName} ${noteName}.wav`,
                blob: wavBlob,
                loopEnd: trimmed.numFrames
            });

            setProgress(10 + (i + 1) / wavFiles.length * 70);
        }

        if (processedSlices.length === 0) {
            throw new Error('No valid samples found');
        }

        // Sort by MIDI note
        processedSlices.sort((a, b) => a.note - b.note);

        log('Creating OP-XY preset...');
        await createPreset(presetName, processedSlices, sampleRate);
        setProgress(100);

        log('Conversion complete!');
        showDownload();

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
