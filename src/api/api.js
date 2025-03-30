// app/client/src/api/api.js
import axios from 'axios';

// Base URL for your (backend) (change this for production or different environments)
const BASE_URL = 'https://mafia-v01-server.onrender.com';

// Axios instance with base URL
const api = axios.create({

  baseURL: BASE_URL,
});

// API Endpoints
export const API_ENDPOINTS = {
  CREATE_GAME: '/api/games',
  JOIN_GAME: (gameId) => `/api/games/${gameId}/join`,
  FETCH_GAME: (gameId) => `/api/games/${gameId}`,
  SET_READY: (gameId) => `/api/games/${gameId}/ready`,
  SET_UNREADY: (gameId) => `/api/games/${gameId}/unready`,
  MAFIA_VOTE: (gameId) => `/api/games/${gameId}/mafiaVote`,
  INVESTIGATE: (gameId) => `/api/games/${gameId}/investigate`,
  SAVE: (gameId) => `/api/games/${gameId}/save`,
  DAY_VOTE: (gameId) => `/api/games/${gameId}/dayVote`,
};


// Socket.IO URL
export const SOCKET_URL = BASE_URL;

// API Functions
export const createGame = (maxPlayers) => api.post(API_ENDPOINTS.CREATE_GAME, { maxPlayers });
export const joinGame = (gameId, name) => api.post(API_ENDPOINTS.JOIN_GAME(gameId), { name });
export const fetchGameData = (gameId) => api.get(API_ENDPOINTS.FETCH_GAME(gameId));
export const setReady = (gameId, name) => api.post(API_ENDPOINTS.SET_READY(gameId), { name });
export const setUnready = (gameId, name) => api.post(API_ENDPOINTS.SET_UNREADY(gameId), { name });
export const mafiaVote = (gameId, voterName, targetName) =>
  api.post(API_ENDPOINTS.MAFIA_VOTE(gameId), { voterName, targetName });
export const investigate = (gameId, investigatorName, targetName) =>
  api.post(API_ENDPOINTS.INVESTIGATE(gameId), { investigatorName, targetName });
export const save = (gameId, doctorName, targetName) =>
  api.post(API_ENDPOINTS.SAVE(gameId), { doctorName, targetName });
export const dayVote = (gameId, voterName, targetName) =>
  api.post(API_ENDPOINTS.DAY_VOTE(gameId), { voterName, targetName });

export default api;