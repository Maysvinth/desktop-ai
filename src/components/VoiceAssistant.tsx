import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Volume2, VolumeX, Terminal, Activity, Monitor, Search, Bell, Settings } from 'lucide-react';
import { createGeminiSession } from '../lib/gemini-live';
import { float32ToInt16, arrayBufferToBase64, base64ToArrayBuffer, int16ToFloat32 } from '../lib/audio-utils';

interface ToolCall {
  name: string;
  args: any;
  id: string;
}

export default function VoiceAssistant() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lastToolCall, setLastToolCall] = useState<ToolCall | null>(null);
  const [status, setStatus] = useState('READY');
  const [logs, setLogs] = useState<string[]>([]);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5));
  };

  const handleToolCall = useCallback((call: ToolCall) => {
    setLastToolCall(call);
    addLog(`[TOOL] ${call.name}: ${JSON.stringify(call.args)}`);
    
    // Simulate desktop control
    setTimeout(() => {
      setLastToolCall(null);
      if (sessionRef.current) {
        sessionRef.current.sendToolResponse({
          functionResponses: [{
            name: call.name,
            response: { status: "success", message: `Successfully executed ${call.name}` },
            id: call.id
          }]
        });
      }
    }, 2000);
  }, []);

  const playNextChunk = useCallback(() => {
    if (playbackQueueRef.current.length === 0 || isPlayingRef.current || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = playbackQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, chunk.length, 24000);
    buffer.getChannelData(0).set(chunk);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextChunk();
    };
    source.start();
  }, []);

  const startSession = async () => {
    try {
      setIsConnecting(true);
      setStatus('CONNECTING...');
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      sessionRef.current = await createGeminiSession(apiKey, {
        onopen: () => {
          setIsConnected(true);
          setIsConnecting(false);
          setStatus('CONNECTED');
          addLog('Session started');
        },
        onmessage: (msg: any) => {
          if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
            const base64 = msg.serverContent.modelTurn.parts[0].inlineData.data;
            const pcm = new Int16Array(base64ToArrayBuffer(base64));
            playbackQueueRef.current.push(int16ToFloat32(pcm));
            playNextChunk();
          }

          if (msg.toolCall) {
            msg.toolCall.functionCalls.forEach((call: any) => handleToolCall(call));
          }

          if (msg.serverContent?.interrupted) {
            playbackQueueRef.current = [];
            isPlayingRef.current = false;
            addLog('Interrupted');
          }
        },
        onclose: () => {
          setIsConnected(false);
          setIsRecording(false);
          setStatus('DISCONNECTED');
          addLog('Session closed');
        },
        onerror: (err: any) => {
          console.error(err);
          setStatus('ERROR');
          addLog(`Error: ${err.message || 'Unknown error'}`);
        }
      });

      // Start recording
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      
      // Use ScriptProcessor for simplicity in this demo environment
      // In production, AudioWorklet is preferred.
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      processorRef.current.onaudioprocess = (e) => {
        if (!isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Resample to 16kHz (crude downsampling for demo)
        const pcm = float32ToInt16(inputData);
        const base64 = arrayBufferToBase64(pcm.buffer);
        
        sessionRef.current.sendRealtimeInput({
          audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      setIsRecording(true);
    } catch (err: any) {
      console.error(err);
      setIsConnecting(false);
      setStatus('FAILED');
      addLog(`Failed: ${err.message}`);
    }
  };

  const stopSession = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (processorRef.current) processorRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close();
    
    setIsConnected(false);
    setIsRecording(false);
    setStatus('READY');
  };

  return (
    <div className="min-h-screen bg-[#E6E6E6] flex items-center justify-center p-4 font-mono">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] bg-[#151619] rounded-2xl shadow-2xl overflow-hidden border border-white/10"
      >
        {/* Header */}
        <div className="p-6 border-bottom border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'} animate-pulse`} />
            <span className="text-[10px] text-white/40 tracking-[2px] uppercase font-bold">System Status: {status}</span>
          </div>
          <Activity className="w-4 h-4 text-white/20" />
        </div>

        {/* Main Display */}
        <div className="px-6 py-8 flex flex-col items-center gap-8">
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Radial Track */}
            <div className="absolute inset-0 border border-dashed border-white/10 rounded-full animate-[spin_20s_linear_infinite]" />
            
            {/* Visualizer Ring */}
            <AnimatePresence>
              {isRecording && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="absolute inset-2 border-2 border-white/20 rounded-full"
                  style={{ boxShadow: '0 0 20px rgba(255,255,255,0.1)' }}
                />
              )}
            </AnimatePresence>

            {/* Trigger Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={isConnected ? stopSession : startSession}
              disabled={isConnecting}
              className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
                isRecording 
                  ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]' 
                  : 'bg-white/5 hover:bg-white/10 border border-white/10'
              }`}
            >
              {isConnecting ? (
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : isRecording ? (
                <Mic className="w-10 h-10 text-white" />
              ) : (
                <MicOff className="w-10 h-10 text-white/40" />
              )}
            </motion.button>
          </div>

          {/* Tool Call Feedback */}
          <AnimatePresence>
            {lastToolCall && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full bg-white/5 rounded-lg p-4 border border-white/10 flex items-center gap-4"
              >
                <div className="p-2 bg-blue-500/20 rounded-md">
                  {lastToolCall.name.includes('app') ? <Monitor className="w-4 h-4 text-blue-400" /> : 
                   lastToolCall.name.includes('search') ? <Search className="w-4 h-4 text-blue-400" /> :
                   lastToolCall.name.includes('reminder') ? <Bell className="w-4 h-4 text-blue-400" /> :
                   <Settings className="w-4 h-4 text-blue-400" />}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Executing Tool</div>
                  <div className="text-sm text-white font-medium">{lastToolCall.name.replace(/_/g, ' ')}</div>
                </div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Logs / Terminal */}
        <div className="bg-black/40 p-6 border-t border-white/5">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="w-3 h-3 text-white/40" />
            <span className="text-[9px] text-white/40 uppercase tracking-[2px]">System Logs</span>
          </div>
          <div className="space-y-2">
            {logs.length === 0 && <div className="text-[11px] text-white/10 italic">No activity recorded...</div>}
            {logs.map((log, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[11px] text-white/60 flex gap-3"
              >
                <span className="text-white/20">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                <span className="truncate">{log}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white/5 flex justify-between items-center px-6">
          <div className="flex gap-4">
            <Volume2 className="w-3 h-3 text-white/20" />
            <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden mt-1">
              <motion.div 
                animate={{ width: isRecording ? '60%' : '0%' }}
                className="h-full bg-white/20" 
              />
            </div>
          </div>
          <span className="text-[9px] text-white/20 uppercase tracking-widest">Model: Gemini 3.1 Live</span>
        </div>
      </motion.div>
    </div>
  );
}
