
import React from "react";
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>){
  return <input {...props} className={`border border-slate-300 rounded-xl px-3 py-2 w-full ${props.className||""}`} />;
}
