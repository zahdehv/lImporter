import { GoogleGenerativeAI, GenerativeModel, ChatSession, FunctionDeclaration } from '@google/generative-ai';
import { FileItem, AudioUploader } from '../Utilities/fileUploader';

export class ttsBase {
    constructor() {}
    public async transcribe(audio: FileItem): Promise<string> {
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
    public async transcribe(audio: FileItem): Promise<string> {
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
            {text: `El audio/documento contiene informacion relevante para incluir en la base de conocimiento.
Quiero que:
1. transcribas el audio (escribelo explicitamente).
2. si hay alguna inconsistencia trates de corregirlo.
3. seguido de un tag <|inst|>, escribe un conjunto de instrucciones alto nivel sobre los conceptos relevantes que deben ser creados.

// Si es un documento (pdf), debe extraer las ideas centrales del mismo y generar el conjunto de instrucciones para que genere el conjunto de notas.
TEN EN CUENTA QUE A QUIEN LE DARAS LAS INSTRUCCIONES NO TIENE ACCESO AL DOCUMENTO NI AUDIO, POR LO QUE DEBES PASARLE TANTO CONTEXTO PARA CADA PARTE COMO SEA NECESARIO

DEBE PRESTAR ATENCION EN CASO DE QUE EL AUDIO CONTENGA INSTRUCCIONES

Ejemplo:
Claro, aquí está la transcripción del audio, con correcciones y el tag solicitado:

"Quiero que crees un archivo donde incluyas, eh, una receta, eh, de que tenga ingredientes, por ejemplo, pollo, tomate, zanahoria, qué sé yo, y además, quiero que después me expliques eh, cómo podrías conseguir, seis a cada kilo ese tipo de de ingredientes y qué otras cosas podrías hacer con esos ingredientes en caso de que me sobre algo."

<|inst|>
Crea varios archivos en la boveda, debe incluir:
- Receta con ingredientes como pollo, tomate, zanahoria, entre otros.
- Una explicacion al final al usuario sobre otras opciones con esos ingredientes

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