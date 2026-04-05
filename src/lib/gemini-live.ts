import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";

// Tools for "controlling" the desktop
export const desktopTools: FunctionDeclaration[] = [
  {
    name: "open_application",
    description: "Opens a desktop application by name.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: {
          type: Type.STRING,
          description: "The name of the application to open (e.g., 'Chrome', 'Spotify', 'Terminal').",
        },
      },
      required: ["appName"],
    },
  },
  {
    name: "set_system_volume",
    description: "Adjusts the system volume.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: {
          type: Type.NUMBER,
          description: "Volume level from 0 to 100.",
        },
      },
      required: ["level"],
    },
  },
  {
    name: "search_web",
    description: "Searches the web for information.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "The search query.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_reminder",
    description: "Creates a system reminder or calendar event.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: "The reminder text.",
        },
        time: {
          type: Type.STRING,
          description: "The time for the reminder (e.g., 'in 5 minutes', 'at 3 PM').",
        },
      },
      required: ["text", "time"],
    },
  },
];

export const SYSTEM_INSTRUCTION = `
You are Echo, a highly advanced voice-controlled desktop assistant. 
You can help users manage their desktop, open applications, set reminders, and search the web.
Your personality is professional, efficient, and helpful.
When a user asks to open an app or control the system, use the provided tools.
Since you are running in a browser, explain that you are simulating the desktop control for this demo, but you can still perform the logic.
Always respond via voice. Keep your responses concise and natural.
`;

export function createGeminiSession(apiKey: string, callbacks: any) {
  const ai = new GoogleGenAI({ apiKey });
  
  return ai.live.connect({
    model: "gemini-3.1-flash-live-preview",
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
      },
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: desktopTools }],
    },
    callbacks,
  });
}
