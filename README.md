# lImporter for Obsidian

## Description
lImporter is an Obsidian plugin that allows you to process various file types, including audio, video, documents, and text, to automatically convert them into structured notes. The plugin uses the Google Generative AI API to transcribe and analyze the file content, extracting relevant information and organizing it according to a predefined style.

## Features
- Automatic processing of a wide range of file types (audio, video, documents, text)
- Customizable list of file extensions to automatically capture
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
3. Configure the list of **Auto-Captured File Types**. These are the file extensions (e.g., `mp3`, `mp4`, `pdf`, `txt`) that will automatically trigger the importer view.
4. Configure additional options according to your preferences.

## Usage
The plugin integrates directly into your workflow:

1. Drag and drop a supported file (e.g., audio, video, document) into your Obsidian vault.
2. If the file extension is in your list of auto-captured types, the **lImporter view** will open automatically.
3. In the view, you can review the file and click the **send button** to start processing.
4. The plugin will then analyze the content and generate structured notes based on the file.

*Alternatively, you can open the lImporter view from the side panel icon and manually select a file from your vault to process.*

## Requirements
- Obsidian v0.15.0 or higher
- Internet connection (for communication with the Google API)
- Google Generative AI API key

## Limitations
- Processing large files may take longer.
- The quality of the output depends on the clarity of the source file (e.g., audio quality, text legibility in a document).
- Internet connection is required for processing.

## Support
If you encounter any problems or have suggestions, please open an issue [here](https://github.com/zahdehv/lImporter/issues).

## Stars ⭐ xD

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=zahdehv/lImporter&type=Date)](https://github.com/zahdehv/lImporter)

</div>