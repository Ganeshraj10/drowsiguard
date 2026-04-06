import React, { useEffect, useRef, useState } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle, Moon, Sun, Camera, Settings, BarChart3, Bell, BellOff } from 'lucide-react';
import { calculateEAR, LEFT_EYE_INDICES, RIGHT_EYE_INDICES } from '../lib/ear';
import { playAlert, stopAlert } from '../lib/audio';

type Status = 'Awake' | 'Drowsy' | 'Sleeping' | 'No Face';

export default function DrowsinessDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('No Face');
  const [ear, setEar] = useState<number>(0);
  const [isAlertOn, setIsAlertOn] = useState<boolean>(true);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [baselineEar, setBaselineEar] = useState<number>(0.25);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);
  const [stats, setStats] = useState<{ awake: number; drowsy: number; sleeping: number }>({
    awake: 0,
    drowsy: 0,
    sleeping: 0,
  });

  const lastStatusRef = useRef<Status>('No Face');
  const closedStartTimeRef = useRef<number | null>(null);
  const isAlertOnRef = useRef<boolean>(isAlertOn);
  const calibrationDataRef = useRef<number[]>([]);

  useEffect(() => {
    isAlertOnRef.current = isAlertOn;
  }, [isAlertOn]);

  const startCalibration = () => {
    setIsCalibrating(true);
    setCalibrationProgress(0);
    calibrationDataRef.current = [];
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      if (!canvasRef.current || !videoRef.current) return;

      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES);
        const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES);
        const avgEAR = (leftEAR + rightEAR) / 2;
        setEar(avgEAR);

        // Calibration logic
        if (isCalibrating) {
          calibrationDataRef.current.push(avgEAR);
          const progress = Math.min((calibrationDataRef.current.length / 100) * 100, 100);
          setCalibrationProgress(progress);

          if (calibrationDataRef.current.length >= 100) {
            const sum = calibrationDataRef.current.reduce((a, b) => a + b, 0);
            const avg = sum / calibrationDataRef.current.length;
            setBaselineEar(avg);
            setIsCalibrating(false);
            calibrationDataRef.current = [];
          }
        }

        let currentStatus: Status = 'Awake';
        // Dynamic threshold: 75% of baseline EAR or a minimum of 0.15
        const EAR_THRESHOLD = Math.max(baselineEar * 0.75, 0.15);

        if (avgEAR < EAR_THRESHOLD) {
          if (closedStartTimeRef.current === null) {
            closedStartTimeRef.current = Date.now();
          }
          const duration = (Date.now() - closedStartTimeRef.current) / 1000;
          if (duration > 3) {
            currentStatus = 'Sleeping';
          } else if (duration > 1) {
            currentStatus = 'Drowsy';
          }
        } else {
          closedStartTimeRef.current = null;
          currentStatus = 'Awake';
        }

        setStatus(currentStatus);

        // Update stats
        if (currentStatus !== lastStatusRef.current) {
          setStats(prev => ({
            ...prev,
            [currentStatus.toLowerCase()]: prev[currentStatus.toLowerCase() as keyof typeof prev] + 1
          }));
          lastStatusRef.current = currentStatus;
        }

        // Alert logic
        if (isAlertOnRef.current && (currentStatus === 'Drowsy' || currentStatus === 'Sleeping')) {
          playAlert();
        } else {
          stopAlert();
        }

        // Draw landmarks for visualization
        canvasCtx.fillStyle = '#00FF00';
        [...LEFT_EYE_INDICES, ...RIGHT_EYE_INDICES].forEach(idx => {
          const landmark = landmarks[idx];
          canvasCtx.beginPath();
          canvasCtx.arc(landmark.x * canvasRef.current!.width, landmark.y * canvasRef.current!.height, 2, 0, 2 * Math.PI);
          canvasCtx.fill();
        });

      } else {
        setStatus('No Face');
        closedStartTimeRef.current = null;
        stopAlert();
      }

      canvasCtx.restore();
    });

    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await faceMesh.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480,
    });

    camera.start().then(() => setIsCameraReady(true));

    return () => {
      camera.stop();
      faceMesh.close();
      stopAlert();
    };
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'Awake': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'Drowsy': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'Sleeping': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'Awake': return <Sun className="w-6 h-6" />;
      case 'Drowsy': return <AlertTriangle className="w-6 h-6" />;
      case 'Sleeping': return <Moon className="w-6 h-6" />;
      default: return <Camera className="w-6 h-6" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Bell className="w-6 h-6" />
              </div>
              DrowsiGuard AI
            </h1>
            <p className="text-slate-400">Real-time fatigue monitoring & alert system</p>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={startCalibration}
              disabled={isCalibrating || !isCameraReady}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
                isCalibrating 
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' 
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50'
              }`}
            >
              <Settings className={`w-4 h-4 ${isCalibrating ? 'animate-spin' : ''}`} />
              {isCalibrating ? `Calibrating ${Math.round(calibrationProgress)}%` : 'Calibrate'}
            </button>
            <button 
              onClick={() => setIsAlertOn(!isAlertOn)}
              className={`p-3 rounded-xl border transition-all duration-300 ${
                isAlertOn 
                ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20' 
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
              }`}
            >
              {isAlertOn ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Feed */}
          <div className="lg:col-span-2 space-y-6">
            <div className="relative aspect-video bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl group">
              {!isCameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900 z-10">
                  <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-slate-400 animate-pulse">Initializing camera feed...</p>
                </div>
              )}

              {isCalibrating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-sm z-20">
                  <div className="text-center space-y-4 max-w-xs">
                    <h3 className="text-xl font-bold text-white">Calibrating Eyes</h3>
                    <p className="text-slate-400 text-sm">Please look directly at the camera with your eyes fully open for a few seconds.</p>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-indigo-500" 
                        initial={{ width: 0 }}
                        animate={{ width: `${calibrationProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <video
                ref={videoRef}
                className="hidden"
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                className="w-full h-full object-cover"
                width={640}
                height={480}
              />

              {/* Overlay Status */}
              <div className="absolute top-6 left-6 flex flex-col gap-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={status}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-md shadow-lg ${getStatusColor()}`}
                  >
                    {getStatusIcon()}
                    <span className="font-bold text-lg uppercase tracking-wider">{status}</span>
                  </motion.div>
                </AnimatePresence>
                
                <div className="flex gap-2">
                  <div className="px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-xs font-mono text-white/70">
                    EAR: {ear.toFixed(3)}
                  </div>
                  <div className="px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-xs font-mono text-indigo-400/70">
                    BASE: {baselineEar.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Warning Overlay */}
              <AnimatePresence>
                {(status === 'Drowsy' || status === 'Sleeping') && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 pointer-events-none border-[12px] animate-pulse ${
                      status === 'Sleeping' ? 'border-rose-500/50' : 'border-amber-500/50'
                    }`}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
                <p className="text-slate-500 text-sm mb-1">Threshold</p>
                <p className="text-xl font-bold text-white">{Math.max(baselineEar * 0.75, 0.15).toFixed(3)} EAR</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
                <p className="text-slate-500 text-sm mb-1">Latency</p>
                <p className="text-xl font-bold text-white">~15ms</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
                <p className="text-slate-500 text-sm mb-1">Alert</p>
                <p className={`text-xl font-bold ${isAlertOn ? 'text-indigo-400' : 'text-slate-600'}`}>
                  {isAlertOn ? 'Active' : 'Muted'}
                </p>
              </div>
            </div>
          </div>

          {/* Sidebar / Analytics */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
              <div className="flex items-center gap-3 text-white font-semibold">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Session Analytics
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Awake States</span>
                    <span className="text-emerald-400 font-bold">{stats.awake}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-emerald-500" 
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.awake / (stats.awake + stats.drowsy + stats.sleeping || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Drowsy Alerts</span>
                    <span className="text-amber-400 font-bold">{stats.drowsy}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-amber-500" 
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.drowsy / (stats.awake + stats.drowsy + stats.sleeping || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Sleep Events</span>
                    <span className="text-rose-400 font-bold">{stats.sleeping}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-rose-500" 
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.sleeping / (stats.awake + stats.drowsy + stats.sleeping || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800">
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  Live Monitoring Active
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-indigo-600/5 border border-indigo-500/20 rounded-3xl p-6">
              <h3 className="text-indigo-400 font-semibold mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Best Results
              </h3>
              <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
                <li>Ensure good lighting on your face</li>
                <li>Position camera at eye level</li>
                <li>Remove glasses if detection is unstable</li>
                <li>Stay within 1-2 meters of the camera</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
