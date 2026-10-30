/** Whether this browser can reach a camera at all (it needs a secure page, and a camera). */
export const cameraCanBeUsed = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
