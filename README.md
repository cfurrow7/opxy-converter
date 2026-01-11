# OP-XY Multisample Converter - Web App

A browser-based tool to convert multisamples to OP-XY format with automatic silence trimming.

**🌐 Live Demo:** [https://cfurrow7.github.io/opxy-converter](https://cfurrow7.github.io/opxy-converter)

**Built to convert patches created with [Tyler Neely's TV-7 sampler](https://tylerneely.com/tv7/tv7.html)** - a browser-based sampling tool that outputs individual WAV files per note.

## Features

- **100% Client-Side Processing** - All conversion happens in your browser, no server needed, no uploads
- **No Installation Required** - Just open the HTML file in any modern browser
- **Two Input Modes:**
  - **Elektron Mode**: Convert `.elmulti` + `.wav` files from Elektron devices
  - **Folder Mode**: Process individual WAV files with note names in filenames
- **Automatic Silence Trimming** - Removes silence from beginning and end (-60dB threshold)
- **Format Support:**
  - PCM audio (16-bit, 24-bit, 32-bit)
  - IEEE Float audio (32-bit float)
  - Mono and stereo samples
- **Download as ZIP** - Get a ready-to-use `.preset` folder
- **Privacy First** - No data leaves your computer

## Quick Start

### Option 1: Use Online (Recommended)
Visit the live demo URL above and start converting immediately.

### Option 2: Download and Use Locally
1. Download [index.html](index.html), [styles.css](styles.css), and [converter.js](converter.js)
2. Double-click `index.html` to open in your browser
3. Start converting!

## Usage

### Elektron Mode
1. Select "Elektron Mode"
2. Upload your `.elmulti` file
3. Upload the corresponding `.wav` file
4. Click "Convert to OP-XY Format"
5. Download the ZIP file
6. Extract the ZIP to get the `.preset` folder
7. Copy the `.preset` folder to the `presets/` directory on your OP-XY
   - Connect OP-XY via USB
   - Enter disk mode: Press **com** button and select **mtp**
   - Navigate to the `presets/` folder
   - You can create subfolders for organization (e.g., `presets/elektron/`)
   - Paste your `.preset` folder
   - Safely eject the OP-XY disk

### Folder Mode
1. Select "Folder Mode"
2. Enter a preset name
3. Select multiple WAV files with note names in filenames
4. Click "Convert to OP-XY Format"
5. Download the ZIP file
6. Extract the ZIP to get the `.preset` folder
7. Copy the `.preset` folder to the `presets/` directory on your OP-XY
   - Connect OP-XY via USB
   - Enter disk mode: Press **com** button and select **mtp**
   - Navigate to the `presets/` folder
   - You can create subfolders for organization (e.g., `presets/elektron/`)
   - Paste your `.preset` folder
   - Safely eject the OP-XY disk

## File Naming for Folder Mode

WAV files should include note information in their filenames:

**Supported formats:**
```
Piano C3.wav
C3.wav
piano_C#3.wav
Bass_Db3.wav
SampleName D-1.wav (negative octaves supported)
Strings_F#4.wav
```

The converter will:
1. Scan all WAV files
2. Extract note names from filenames
3. Trim silence from each sample
4. Create proper MIDI key mappings
5. Generate OP-XY compatible preset

## OP-XY Setup

After conversion, install your preset on the OP-XY:

1. **Connect OP-XY** via USB cable to your computer
2. **Enter Disk Mode** on the OP-XY:
   - Press the **com** button and select **mtp**
   - The OP-XY will mount as a disk drive
3. **Navigate** to the `presets/` folder on the OP-XY disk
4. **Organize** (optional): Create subfolders like `presets/elektron/` or `presets/custom/`
5. **Copy** the entire `.preset` folder into your chosen location
6. **Eject** the OP-XY disk safely
7. **Browse** presets on your OP-XY - your new preset will appear!

### Important Notes:
- The `.preset` folder contains both the `patch.json` and all WAV files
- You can create subfolders inside `presets/` to organize your sounds
- Folder/file names may only contain: `a-z A-Z 0-9 space # - ( )`
- OP-XY supports both `.wav` and `.aif` files (mono and stereo)

## Technical Details

### Audio Processing
- **Silence Detection**: -60dB threshold
- **Frame-by-frame Analysis**: Checks all channels
- **Format Support**: 16/24/32-bit PCM and 32-bit IEEE Float
- **Output Format**: Converts to 16-bit PCM for optimal OP-XY performance
- **File Size Reduction**: 50-75% smaller than original (32-bit → 16-bit)

### Key Mapping
- Automatically calculates key ranges between samples
- Each sample's range is split between neighboring notes
- First sample covers MIDI 0 to its lower bound
- Last sample covers its upper bound to MIDI 127

### OP-XY Format
- Creates proper `patch.json` with all required fields
- Platform: OP-XY
- Type: multisampler
- Version: 4
- Includes engine, envelope, FX, and LFO settings
- Configures loop points (loops before end to avoid clicks)
- Sets velocity sensitivity and playback mode

## Browser Requirements

- **Chrome**: 51+ (Recommended)
- **Firefox**: 54+
- **Safari**: 10+
- **Edge**: 15+
- JavaScript enabled
- Modern File API support

## Privacy & Security

All processing happens **100% locally** in your browser:
- No files are uploaded to any server
- No data is collected or tracked
- No internet connection required after initial page load
- Your samples stay private on your device

## Deployment Options

### GitHub Pages (Free)
1. Fork this repository
2. Go to Settings → Pages
3. Set Source to "main branch"
4. Your tool will be live at `https://yourusername.github.io/repo-name`

### Self-Hosted
1. Upload `index.html`, `styles.css`, `converter.js` to any web server
2. No server-side processing required - just static file hosting
3. Works with any hosting: GitHub Pages, Netlify, Vercel, etc.

### Local Usage
Simply open `index.html` in your browser - no server needed!

## Troubleshooting

**Conversion fails:**
- Ensure WAV files are valid (not corrupted)
- Check that .elmulti file matches the WAV file
- Try using Chrome if having issues in other browsers

**"Could not extract note from filename":**
- Filenames must include note names like C3, D#4, Gb2
- Use one of the supported formats listed above
- Remove special characters except # and b

**"No valid samples found":**
- Ensure WAV files have note names in filenames
- Check that files are actual WAV audio files
- Verify files aren't empty or corrupted

**ZIP file is empty:**
- This was an early bug, now fixed
- Make sure you're using the latest version
- Clear browser cache and try again

**Audio sounds distorted:**
- Early versions had issues with IEEE Float format
- Current version properly handles all audio formats
- Re-download the latest version if experiencing issues

## Development

### Project Structure
```
web/
├── index.html      # Main interface
├── styles.css      # Beautiful gradient UI
├── converter.js    # All conversion logic
├── README.md       # This file
└── test.html       # Test page
```

### Key Functions
- `parseElmulti()` - Parse Elektron TOML format
- `readWavFile()` - Read and parse WAV headers
- `trimSilence()` - Detect and remove silence
- `createWavFile()` - Generate output WAV files
- `createPreset()` - Build OP-XY patch.json
- `downloadPreset()` - Package and download ZIP

### Dependencies
- **JSZip** (CDN): For creating ZIP files
- No other dependencies!

## Contributing

Contributions welcome! This tool is free and open source.

**Ideas for improvements:**
- Drag & drop file upload
- Batch conversion support
- Custom silence threshold settings
- Sample preview player
- Advanced key mapping options

## Credits

Created for the OP-XY community. Based on the original Python CLI tool.

**Related Tools:**
- [Python CLI Version](../) - Command-line converter with GUI

## License

Free to use and modify. Created for the OP-XY community.

---

**Made with ❤️ for OP-XY users**

Having issues? [Open an issue](https://github.com/yourusername/opxy-converter/issues) on GitHub.
