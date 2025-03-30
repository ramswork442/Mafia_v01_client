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
  const [isMuted, setIsMuted] = useState(!isAlive);

  const audioRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const audioContextRef = useRef(null); // FIX: Initialize later
  const isMountedRef = useRef(true); // FIX: Track component mount state

  useEffect(() => {
    if (game.currentPhase !== 'day' || isAlive === undefined) return;

    const initAudio = async () => {
      try {
        // FIX: Create AudioContext inside useEffect and resume it
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
        }
        if (!isAlive) {
          stream.getAudioTracks().forEach((track) => (track.enabled = false));
          setIsMuted(true);
        }

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        localAnalyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const updateAudioLevel = () => {
          if (!isMountedRef.current) return; // FIX: Stop if unmounted
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
          setAudioLevel(avg / 255);
          if (isAlive) requestAnimationFrame(updateAudioLevel);
        };
        if (isAlive) updateAudioLevel();

        socket.emit('joinAudio', { gameId });

        // FIX: Handle rtpCapabilities with proper cleanup
        const handleRtpCapabilities = async (rtpCapabilities) => {
          try {
            const newDevice = new Device();
            await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
            setDevice(newDevice);

            // Send Transport
            if (!sendTransportRef.current) {
              socket.emit('createTransport', { gameId, direction: 'send' }, async (transportParams) => {
                if (transportParams.error) {
                  console.error('Send transport error:', transportParams.error);
                  return;
                }
                const sendTransport = newDevice.createSendTransport(transportParams);
                sendTransportRef.current = sendTransport;

                sendTransport.on('connect', ({ dtlsParameters }, callback) => {
                  socket.emit('connectTransport', { gameId, transportId: transportParams.id, dtlsParameters });
                  callback();
                });
                sendTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
                  socket.emit('produce', { gameId, transportId: transportParams.id, kind, rtpParameters }, (response) => {
                    if (response && response.id) {
                      callback({ id: response.id });
                    } else {
                      console.error('Produce failed:', response?.error);
                      callback({ error: 'No producer ID returned' });
                    }
                  });
                });

                if (isAlive) {
                  const producer = await sendTransport.produce({ track: stream.getAudioTracks()[0] });
                  setProducers([producer]);
                }
              });
            }

            // Receive Transport
            if (!recvTransportRef.current) {
              socket.emit('createTransport', { gameId, direction: 'recv' }, async (transportParams) => {
                if (transportParams.error) {
                  console.error('Recv transport error:', transportParams.error);
                  return;
                }
                const recvTransport = newDevice.createRecvTransport(transportParams);
                recvTransportRef.current = recvTransport;

                recvTransport.on('connect', ({ dtlsParameters }, callback) => {
                  socket.emit('connectTransport', { gameId, transportId: transportParams.id, dtlsParameters });
                  callback();
                });
              });
            }
          } catch (err) {
            console.error('Device initialization failed:', err);
          }
        };

        // FIX: Handle newProducer with error checking
        const handleNewProducer = async ({ producerId }) => {
          if (!recvTransportRef.current || !device) return;
          try {
            const consumer = await recvTransportRef.current.consume({
              producerId,
              rtpCapabilities: device.rtpCapabilities,
            });
            const remoteStream = new MediaStream([consumer.track]);
            const audio = document.createElement('audio');
            audio.srcObject = remoteStream;
            audio.autoplay = true;
            audio.volume = 1.0; // Ensure volume is set
            document.body.appendChild(audio);
            setConsumers((prev) => [...prev, { consumer, audio }]);
          } catch (err) {
            console.error('Consumer creation failed:', err);
          }
        };

        socket.on('rtpCapabilities', handleRtpCapabilities);
        socket.on('newProducer', handleNewProducer);

        // Audio start/stop events
        socket.on('audioStarted', () => console.log('Audio started for game:', gameId));
        socket.on('audioStopped', () => {
          producers.forEach((p) => p.close());
          consumers.forEach(({ consumer }) => consumer.close());
          setProducers([]);
          setConsumers([]);
        });
      } catch (err) {
        console.error('Audio initialization failed:', err);
      }
    };

    initAudio();

    return () => {
      isMountedRef.current = false; // FIX: Stop animations and loops
      socket.off('rtpCapabilities');
      socket.off('newProducer');
      socket.off('audioStarted');
      socket.off('audioStopped');
      producers.forEach((p) => p.close());
      consumers.forEach(({ consumer, audio }) => {
        consumer.close();
        if (audio && audio.parentNode) audio.parentNode.removeChild(audio);
      });
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
      audioRef.current?.srcObject?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
      setProducers([]);
      setConsumers([]);
      setDevice(null);
    };
  }, [socket, gameId, game.currentPhase, isAlive]);

  const toggleMute = () => {
    if (!isAlive) return;
    const stream = audioRef.current?.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
      setIsMuted((prev) => !prev);
    }
  };

  return (
    <div className="bg-opacity-80 bg-gray-900 p-4 rounded-lg shadow-lg border border-gray-700 w-full">
      <h3 className="text-xl sm:text-2xl font-semibold mb-2 text-white">Audio Chat</h3>
      <audio ref={audioRef} autoPlay muted={isMuted} className="hidden" />
      {isAlive ? (
        <>
          <div className="mb-4">
            {localAnalyserRef.current ? (
              <AudioVisualizer analyser={localAnalyserRef.current} />
            ) : (
              <p className="text-gray-400">Initializing audio visualizer...</p>
            )}
          </div>
          <p className="text-sm text-gray-400">Audio Level</p>
          <button
            onClick={toggleMute}
            className={`mt-2 p-2 rounded-md text-white ${
              isMuted ? 'bg-red-500 hover:bg-red-700' : 'bg-blue-500 hover:bg-blue-600'
            } transition w-full sm:w-auto`}
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