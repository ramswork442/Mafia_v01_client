import React, { useState, useEffect, useRef } from 'react';
import { Device } from 'mediasoup-client';

const AudioVisualizer = ({ analyser, isContextActive }) => {
  const canvasRef = useRef();
  const animationFrameId = useRef();

  useEffect(() => {
    if (!analyser || !canvasRef.current || !isContextActive) {
      // console.log(`Visualizer skipped: analyser=${analyser ? 'exists' : 'null'}, canvas=${canvasRef.current ? 'exists' : 'null'}, active=${isContextActive}`);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isContextActive) {
        // console.log('Visualizer draw stopped: context inactive');
        return;
      }
      animationFrameId.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = 'rgb(200, 200, 200)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      const sample = dataArray.slice(0, 5);
      // console.log(`Visualizer drawing: sample=${sample}, bars=${Math.floor(canvas.width / (barWidth + 1))}`);
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        ctx.fillStyle = 'rgb(0, 150, 255)';
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();
    return () => cancelAnimationFrame(animationFrameId.current);
  }, [analyser, isContextActive]);

  return <canvas ref={canvasRef} width="300" height="100" className="border" />;
};

function AudioChat({ socket, gameId, playerName, game, isAlive, playerId }) {
  const [producers, setProducers] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(true); // Start muted to prevent echo
  const [analyserReady, setAnalyserReady] = useState(false);
  const [isContextActive, setIsContextActive] = useState(false); // Start false, enable on init
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const audioRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const deviceRef = useRef(null);
  const isMountedRef = useRef(true);

  // Socket Listeners
  useEffect(() => {
    // console.log(`Setting up socket listeners for ${playerName} (${playerId})`);

    const handleRtpCapabilities = async (rtpCapabilities) => {
      try {
        if (!deviceRef.current) {
          deviceRef.current = new Device();
          await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
          // console.log(`Device loaded for ${playerName}`);
        }
      } catch (err) {
        console.error('Device initialization failed:', err);
      }
    };

    const handleNewProducer = ({ producerId, playerId: producerPlayerId }) => {
      if (producerPlayerId === playerId) {
        // console.log(`Skipping own producer ${producerId} for ${playerName}`);
        return;
      }
      // console.log(`Received newProducer ${producerId} from player ${producerPlayerId} for ${playerName}`);
      consumeProducer(producerId);
    };

    const handleAudioStarted = () => {
      // console.log('Audio started for game:', gameId);
      setIsContextActive(true);
    };

    const handleAudioStopped = () => {
      // console.log('Audio stopped for game:', gameId);
      setIsContextActive(false);
      cleanupAudioResources();
    };

    socket.on('rtpCapabilities', handleRtpCapabilities);
    socket.on('newProducer', handleNewProducer);
    socket.on('audioStarted', handleAudioStarted);
    socket.on('audioStopped', handleAudioStopped);

    return () => {
      socket.off('rtpCapabilities', handleRtpCapabilities);
      socket.off('newProducer', handleNewProducer);
      socket.off('audioStarted', handleAudioStarted);
      socket.off('audioStopped', handleAudioStopped);
    };
  }, [socket, gameId, playerName, playerId]);

  // Audio Level Visualizer Loop
  useEffect(() => {
    if (!audioInitialized || !analyserReady || !localAnalyserRef.current || !isContextActive) return;

    const analyser = localAnalyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateAudioLevel = () => {
      if (!isMountedRef.current || !isContextActive || !analyserReady) {
        // console.log(`Audio level update stopped for ${playerName}: mounted=${isMountedRef.current}, active=${isContextActive}, ready=${analyserReady}`);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      // console.log(`Audio level data for ${playerName}: avg=${avg.toFixed(2)}, sample=${dataArray.slice(0, 5)}`);
      setAudioLevel(avg / 255);
      requestAnimationFrame(updateAudioLevel);
    };
    requestAnimationFrame(updateAudioLevel);

    return () => console.log(`Stopping audio level loop for ${playerName}`);
  }, [audioInitialized, analyserReady, isContextActive, playerName]);

  // Cleanup on Unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupAudioResources();
    };
  }, []);

  const initAudio = async () => {
    if (audioInitialized || !isAlive || game.currentPhase !== 'day') {
      console.log(`Audio init skipped for ${playerName}: alreadyInitialized=${audioInitialized}, isAlive=${isAlive}, phase=${game.currentPhase}`);
      return;
    }

    console.log(`Initializing audio for ${playerName} (${playerId})`);
    let stream;

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log(`Mic track enabled: ${stream.getAudioTracks()[0].enabled}`);
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
        audioRef.current.muted = true;
        stream.getAudioTracks()[0].enabled = false; // Start muted
        setIsMuted(true);
      }
      setPermissionDenied(false);

      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyser);
      localAnalyserRef.current = analyser;
      setAnalyserReady(true);
      console.log(`Analyser setup for ${playerName}: ready=${true}, analyser=${analyser ? 'exists' : 'null'}`);

      socket.emit('joinAudio', { gameId });

      if (!deviceRef.current) {
        // console.log('Device not yet loaded, waiting for rtpCapabilities...');
        await new Promise((resolve) => socket.once('rtpCapabilities', resolve));
      }

      if (!sendTransportRef.current) {
        const sendParams = await new Promise((resolve) => {
          socket.emit('createTransport', { gameId, direction: 'send' }, resolve);
        });
        if (sendParams.error) throw new Error(`Send transport error: ${sendParams.error}`);
        console.log(`Send transport created: ${sendParams.id} for ${playerName}`);

        const sendTransport = deviceRef.current.createSendTransport(sendParams);
        sendTransportRef.current = sendTransport;

        sendTransport.on('connect', async ({ dtlsParameters }, callback) => {
          console.log(`Connecting send transport ${sendParams.id} for ${playerName}`);
          await new Promise((resolve) => {
            socket.emit('connectTransport', { gameId, transportId: sendParams.id, dtlsParameters }, (response) => {
              if (response?.error) {
                console.error('Connect transport error:', response.error);
                resolve(false);
              } else {
                console.log(`Send transport ${sendParams.id} connected for ${playerName}`);
                resolve(true);
              }
            });
          });
          callback();
        });

        sendTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
          // console.log(`Producing audio for ${playerName}`);
          const producerId = await new Promise((resolve) => {
            socket.emit('produce', { gameId, transportId: sendParams.id, kind, rtpParameters, playerId }, (response) => {
              if (response.error) {
                console.error('Produce error:', response.error);
                resolve(null);
              } else {
                console.log(`Producer ID received: ${response.id} for ${playerName}`);
                resolve(response.id);
              }
            });
          });
          callback({ id: producerId });
        });

        sendTransport.on('connectionstatechange', (state) => {
          console.log(`Send transport state for ${playerName}: ${state}`);
          if (state === 'connected') {
            console.log(`Send transport ${sendParams.id} is connected, producers: ${producers.length}`);
          }
        });

        // console.log(`Starting production for send transport ${sendParams.id}`);
        const producer = await sendTransport.produce({ track: stream.getAudioTracks()[0] });
        // console.log(`Producer created: ${producer.id} for ${playerName}`);
        setProducers([producer]);
      }

      if (!recvTransportRef.current) {
        const recvParams = await new Promise((resolve) => {
          socket.emit('createTransport', { gameId, direction: 'recv' }, resolve);
        });
        if (recvParams.error) throw new Error(`Recv transport error: ${recvParams.error}`);
        // console.log(`Recv transport created: ${recvParams.id} for ${playerName}`);

        const recvTransport = deviceRef.current.createRecvTransport(recvParams);
        recvTransportRef.current = recvTransport;

        recvTransport.on('connect', async ({ dtlsParameters }, callback) => {
          // console.log(`Connecting recv transport ${recvParams.id} for ${playerName}`);
          await new Promise((resolve) => {
            socket.emit('connectTransport', { gameId, transportId: recvParams.id, dtlsParameters }, (response) => {
              if (response?.error) {
                console.error('Connect transport error:', response.error);
              }
              resolve();
            });
          });
          callback();
        });

        recvTransport.on('connectionstatechange', (state) => {
          // console.log(`Recv transport state for ${playerName}: ${state}`);
        });

        // Consume existing producers
        await new Promise((resolve) => {
          socket.emit('getProducers', { gameId }, (response) => {
            if (response?.producers) {
              response.producers.forEach(({ producerId, playerId: producerPlayerId }) => {
                if (producerPlayerId !== playerId) {
                  // console.log(`Consuming existing producer ${producerId} from ${producerPlayerId} for ${playerName}`);
                  consumeProducer(producerId);
                }
              });
            }
            resolve();
          });
        });
      }

      setAudioInitialized(true);
      setIsContextActive(true);
      console.log(`Audio initialized for ${playerName}, contextActive=${true}`);
    } catch (err) {
      console.error(`Audio initialization failed for ${playerName}:`, err);
      if (err.name === 'NotAllowedError') setPermissionDenied(true);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    }
  };

  const cleanupAudioResources = () => {
    // console.log(`Cleaning up audio resources for ${playerName}`);
    setIsContextActive(false);
    producers.forEach((p) => p.close());
    consumers.forEach(({ consumer, audio }) => {
      consumer.close();
      if (audio && audio.parentNode) audio.parentNode.removeChild(audio);
    });
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    if (audioRef.current?.srcObject) {
      audioRef.current.srcObject.getTracks().forEach((track) => track.stop());
      audioRef.current.srcObject = null;
    }
    audioContextRef.current?.close();
    setProducers([]);
    setConsumers([]);
    setAnalyserReady(false);
    setAudioInitialized(false);
  };

  const consumeProducer = async (producerId) => {
    if (!recvTransportRef.current || !deviceRef.current) {
      console.log(`Recv transport or device not ready for ${playerName}, cannot consume ${producerId}`);
      return;
    }
    if (consumers.some(({ consumer }) => consumer.producerId === producerId)) {
      console.log(`Already consuming producer ${producerId} for ${playerName}`);
      return;
    }

    try {
      console.log(`Consuming producer ${producerId} for ${playerName}`);
      const consumerParams = await new Promise((resolve) => {
        socket.emit('consume', {
          gameId,
          transportId: recvTransportRef.current.id,
          producerId,
          rtpCapabilities: deviceRef.current.rtpCapabilities,
        }, resolve);
      });

      if (consumerParams.error) throw new Error(`Consume failed: ${consumerParams.error}`);
      console.log(`Consumer params received for ${playerName}:`, consumerParams);

      const consumer = await recvTransportRef.current.consume(consumerParams);
      await consumer.resume();
      console.log(`Consumer created: ${consumer.id} for ${playerName}, consuming ${producerId}`);
    console.log(`Consumer track state: enabled=${consumer.track.enabled}, muted=${consumer.track.muted}`);

      const remoteStream = new MediaStream([consumer.track]);
      const audio = document.createElement('audio');
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.volume = 1.0;
      document.body.appendChild(audio);
     console.log(`Remote audio setup: muted=${audio.muted}, volume=${audio.volume}, paused=${audio.paused}, srcObject tracks=${remoteStream.getTracks().length}`);

    audio.onplay = () => console.log(`Audio ${consumer.id} started playing for ${playerName}`);
    audio.onerror = (e) => console.error(`Audio ${consumer.id} error for ${playerName}:`, e);

      setConsumers((prev) => [...prev, { consumer, audio }]);

      consumer.on('transportclose', () => {
        console.log(`Consumer ${consumer.id} closed due to transport close for ${playerName}`);
        setConsumers((prev) => prev.filter((c) => c.consumer.id !== consumer.id));
        if (audio.parentNode) audio.parentNode.removeChild(audio);
      });
    } catch (err) {
      console.error(`Error consuming producer ${producerId} for ${playerName}:`, err);
    }
  };

  const toggleMute = () => {
    if (!isAlive || !audioInitialized) return;
    const stream = audioRef.current?.srcObject;
    if (stream) {
      const track = stream.getAudioTracks()[0];
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
      // console.log(`Mute toggled for ${playerName}: enabled=${track.enabled}`);
    }
  };

  return (
    <div className="bg-opacity-80 bg-gray-900 p-4 rounded-lg shadow-lg border border-gray-700 w-full">
      <h3 className="text-xl sm:text-2xl font-semibold mb-2 text-white">Audio Chat</h3>
      <audio ref={audioRef} autoPlay muted className="hidden" />
      {isAlive && game.currentPhase === 'day' ? (
        <>
          {!audioInitialized && !permissionDenied && (
            <button
              onClick={initAudio}
              className="mt-2 p-2 rounded-md text-white bg-blue-500 hover:bg-blue-600 transition w-full sm:w-auto"
            >
              Start Audio
            </button>
          )}
          {permissionDenied && (
            <div className="text-red-400 mb-4">
              <p>Microphone permission denied. Please allow access and try again.</p>
              <button
                onClick={initAudio}
                className="mt-2 p-2 rounded-md text-white bg-blue-500 hover:bg-blue-600 transition w-full sm:w-auto"
              >
                Retry Audio
              </button>
            </div>
          )}
          {audioInitialized && (
            <>
              <div className="mb-4">
                {analyserReady && localAnalyserRef.current && isContextActive ? (
                  <AudioVisualizer analyser={localAnalyserRef.current} isContextActive={isContextActive} />
                ) : (
                  <p className="text-gray-400">Initializing audio visualizer...</p>
                )}
              </div>
              <p className="text-sm text-gray-400">Audio Level: {audioLevel.toFixed(2)}</p>
              <button
                onClick={toggleMute}
                className={`mt-2 p-2 rounded-md text-white ${
                  isMuted ? 'bg-red-500 hover:bg-red-700' : 'bg-blue-500 hover:bg-blue-600'
                } transition w-full sm:w-auto`}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            </>
          )}
        </>
      ) : (
        <p className="text-gray-400">
          {isAlive ? 'Audio only available during day phase.' : 'You are dead and muted. You can only listen.'}
        </p>
      )}
    </div>
  );
}

export default AudioChat;