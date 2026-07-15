export async function loadLameJS(): Promise<any> {
  // @ts-ignore
  if (window.lamejs) return window.lamejs;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
    script.onload = () => {
      // @ts-ignore
      resolve(window.lamejs);
    };
    script.onerror = () => reject(new Error('Failed to load lamejs'));
    document.head.appendChild(script);
  });
}
