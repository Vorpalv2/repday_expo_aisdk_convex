const runtime=globalThis as typeof globalThis & {
  requestAnimationFrame?: (callback:(timestamp:number)=>void)=>number;
  cancelAnimationFrame?: (handle:number)=>void;
};

if(typeof runtime.requestAnimationFrame!=='function'){
  runtime.requestAnimationFrame=callback=>setTimeout(()=>callback(Date.now()),16) as unknown as number;
  runtime.cancelAnimationFrame=handle=>clearTimeout(handle);
}
