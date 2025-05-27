# lImporter for Obsidian

## Description
lImporter is an Obsidian plugin that allows you to process audio and PDF files to automatically convert them into structured notes. The plugin uses the Google Generative AI API to transcribe and analyze the file content, extracting relevant information and organizing it according to the Zettelkasten style.

## Features
- Automatic processing of audio files (mp3, wav, ogg, m4a, aac, flac, aiff)
- Support for PDF files
- Extraction of key information and relevant facts
- Automatic generation of structured notes
- Creation of links between related notes

## Installation
1. Download the latest version from the [Releases](https://github.com/zahdehv/lImporter/releases) section
2. Extract the content into the `.obsidian/plugins/` folder of your Obsidian vault
3. Activate the plugin in Obsidian's settings (Settings > Community Plugins)

## Configuration
1. Open the plugin settings in Obsidian (Settings > Community Plugins > lImporter)
2. Enter your Google API key (you can get it from [Google AI Studio](https://makersuite.google.com/app/apikey))
3. Configure additional options according to your preferences

## Usage
The plugin works automatically:

1. Simply drag and drop audio or PDF files into your Obsidian vault
2. The plugin will automatically detect compatible files
3. A modal window will open to process the file
4. Click the send button to start processing
5. The plugin will generate structured notes based on the file's content

## Requirements
- Obsidian v0.15.0 or higher
- Internet connection (for communication with the Google API)
- Google Generative AI API key

## Limitations
- Processing large files may take longer
- Transcription quality depends on the clarity of the original audio
- Internet connection is required for processing

## Support
If you encounter any problems or have suggestions, please open an issue [here](https://github.com/zahdehv/lImporter/issues).