import { GoogleGenerativeAI, GenerativeModel, ChatSession, FunctionDeclaration } from '@google/generative-ai';
import { AudioItem, AudioUploader } from '../Utilities/fileUploader';

export class ttsBase {
    constructor() {}
    public async transcribe(audio: AudioItem): Promise<string> {
        return "This is a placeholder for the actual implementation";
    }
}
export class ttsGeminiFL extends ttsBase {
    private upldr: AudioUploader;
    private model: GenerativeModel;
    constructor(apiKey: string) {
        super();
        const genAI = new GoogleGenerativeAI(apiKey);
        
        this.model = genAI.getGenerativeModel({
                    model: "gemini-2.0-flash",
                });
        this.upldr = new AudioUploader(apiKey);
    }
    public async transcribe(audio: AudioItem): Promise<string> {
        if (!(audio.uploaded)) {
            await this.upldr.uploadAudioBlob(audio);}
        const file = audio.uploadData.file;
        const result = await this.model.generateContent([
            {
              fileData: {
                mimeType: file.mimeType,
                fileUri: file.uri,
              },
            },
            {text: `El audio contiene instrucciones a seguir para realizar una tarea específica.
Quiero que:
1. transcribas el audio (escribelo explicitamente).
2. si hay alguna inconsistencia trates de corregirlo.
3. seguido de un tag <|inst|>, escribe un la version de la transcripcion corregida(solo si es necesario).

Ejemplo:
Claro, aquí está la transcripción del audio, con correcciones y el tag solicitado:

"Quiero que crees un archivo donde incluyas, eh, una receta, eh, de que tenga ingredientes, por ejemplo, pollo, tomate, zanahoria, qué sé yo, y además, quiero que después me expliques eh, cómo podrías conseguir, seis a cada kilo ese tipo de de ingredientes y qué otras cosas podrías hacer con esos ingredientes en caso de que me sobre algo."

<|inst|>
Quiero que crees un archivo donde incluyas una receta, que tenga ingredientes, por ejemplo, pollo, tomate, zanahoria, qué sé yo, y además, quiero que después me expliques cómo podría conseguir estos ingredientes y qué otras cosas podrías hacer con estos ingredientes en caso de que me sobre alguno.

`},
          ]);
        const txt = result.response.text();
        const inst0 = txt.split("<|inst|>");
        const inst1 = inst0[inst0.length - 1].split("</|inst|>");
        const inst = inst1[inst1.length - 1].trim();

        console.log("text");
        console.log(txt);
        console.log("text");
        console.log(inst);

        return inst;
    }
}