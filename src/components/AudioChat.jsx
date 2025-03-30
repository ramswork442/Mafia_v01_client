import React, { useState, useEffect, useRef } from 'react';
import { Device } from 'mediasoup-client';

const AudioVisualizer = ({ analyser }) => {
  const canvasRef = useRef();
  const animationFrameId = useRef();

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas and draw background
      ctx.fillStyle = 'rgb(200, 200, 200)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        ctx.fillStyle = 'rgb(0, 150, 255)';
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();
    return () => cancelAnimationFrame(animationFrameId.current);
  }, [analyser]);

  return <canvas ref={canvasRef} width="300" height="100" className="border" />;
};

function AudioChat({ socket, gameId, playerName, game, isAlive }) {
  const [device, setDevice] = useState(null);
  const [producers, setProducers] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(!isAlive); // Mute dead players by default

  const audioRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const [localAnalyser, setLocalAnalyser] = useState(null); // for visualizer
  // Shared AudioContext (with fallback for Safari)
  const audioContextRef = useRef(new (window.AudioContext || window.webkitAudioContext)());

  useEffect(() => {
    // Only initialize audio during the day phase and if player is alive or undefined (initial load)
    if (game.currentPhase !== 'day' || isAlive === undefined) return;

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Assign stream to hidden audio element so playback is allowed
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
        }

        // Immediately mute dead players
        if (!isAlive) {
          stream.getAudioTracks().forEach((track) => (track.enabled = false));
          setIsMuted(true);
        }

        // Create analyzer for audio visualization
        const audioCtx = audioContextRef.current;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        localAnalyserRef.current = analyser;
        setLocalAnalyser(analyser);

        // Audio level visualization using our own update loop
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const updateAudioLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
          setAudioLevel(avg / 255); // value between 0 and 1
          if (isAlive) requestAnimationFrame(updateAudioLevel);
        };
        updateAudioLevel();

        // Join audio room
        socket.emit('joinAudio', { gameId });

        socket.on('rtpCapabilities', async (rtpCapabilities) => {
          const newDevice = new Device();
          await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
          setDevice(newDevice);

          // Create send transport
          socket.emit('createTransport', { gameId, direction: 'send' }, async (transportParams) => {
            const sendTransport = newDevice.createSendTransport(transportParams);
            sendTransportRef.current = sendTransport;

            sendTransport.on('connect', ({ dtlsParameters }, callback) => {
              socket.emit('connectTransport', { gameId, transportId: transportParams.id, dtlsParameters });
              callback();
            });
            sendTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
              socket.emit('produce', { gameId, transportId: transportParams.id, kind, rtpParameters }, (producerId) => {
                callback({ id: producerId });
              });
            });

            if (isAlive) {
              const producer = await sendTransport.produce({ track: stream.getAudioTracks()[0] });
              setProducers([producer]);
            }
          });

          // Create receive transport
          socket.emit('createTransport', { gameId, direction: 'recv' }, async (transportParams) => {
            const recvTransport = newDevice.createRecvTransport(transportParams);
            recvTransportRef.current = recvTransport;

            recvTransport.on('connect', ({ dtlsParameters }, callback) => {
              socket.emit('connectTransport', { gameId, transportId: transportParams.id, dtlsParameters });
              callback();
            });

            socket.on('newProducer', async ({ producerId }) => {
              const consumer = await recvTransport.consume({
                producerId,
                rtpCapabilities: newDevice.rtpCapabilities,
              });
              const remoteStream = new MediaStream([consumer.track]);
              const audio = document.createElement('audio');
              audio.srcObject = remoteStream;
              audio.autoplay = true;
              document.body.appendChild(audio);
              setConsumers((prev) => [...prev, { consumer, audio }]);
            });
          });
        });
      } catch (err) {
        console.error('Audio initialization failed:', err);
      }
    };

    initAudio();

    // Cleanup function
    return () => {
      socket.off('rtpCapabilities');
      socket.off('newProducer');
      producers.forEach((p) => p.close());
      consumers.forEach(({ consumer, audio }) => {
        consumer.close();
        if (audio && audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
      });
      if (sendTransportRef.current) sendTransportRef.current.close();
      if (recvTransportRef.current) recvTransportRef.current.close();
      if (audioRef.current && audioRef.current.srcObject) {
        audioRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
      setProducers([]);
      setConsumers([]);
      setDevice(null);
    };
  }, [socket, gameId, game.currentPhase, isAlive]);

  const toggleMute = () => {
    if (!isAlive) return; // Dead players can't toggle mute
    const stream = audioRef.current?.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
      setIsMuted((prev) => !prev);
    }
  };

  return (
    <div className="bg-opacity-80 bg-gray-900 p-4 rounded-lg shadow-lg border border-gray-700">
      <h3 className="text-2xl font-semibold mb-2 text-white">Audio Chat</h3>
      <audio ref={audioRef} autoPlay muted className="hidden" />
      {isAlive ? (
        <>
          {/* Canvas-based audio visualizer for local audio */}
          <div className="mb-4">
            {localAnalyser ? (
              <AudioVisualizer analyser={localAnalyser} />
            ) : (
              <p className="text-gray-400">Initializing audio visualizer...</p>
            )}
          </div>
          {/* <div className="w-full h-4 bg-gray-200 rounded-md mt-2">
            <div
              className="h-full bg-green-500 rounded-md transition-all duration-100"
              style={{ width: `${audioLevel * 100}%` }}
            />
          </div> */}
          <p className="text-sm text-gray-400">Audio Level</p>
          <button
            onClick={toggleMute}
            className={`mt-2 p-2 rounded-md text-white ${isMuted ? 'bg-red-500 hover:bg-red-700' : 'bg-blue-500 hover:bg-blue-600'} transition`}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        </>
      ) : (
        <p className="text-gray-400">You are dead and muted. You can only listen.</p>
      )}
    </div>
  );
}

export default AudioChat;
