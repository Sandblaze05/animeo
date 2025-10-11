'use client'

import { motion } from "motion/react";
import { X, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { useEffect } from "react";

const icons = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertTriangle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

const Toast = ({ id, message, type, onClose, duration = 5000 }) => {

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => {
      clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.3 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.5 }}
      transition={{ duration: 0.3 }}
      className="mb-2 flex w-full max-w-sm items-start gap-3 rounded-lg bg-neutral-800/60 backdrop-blur-md border-1 border-gray-400/50 p-4 text-white shadow-lg"
    >
      <div className="flex-shrink-0">{icons[type]}</div>
      <p className="flex-grow text-sm font-medium">{message}</p>
      <button onClick={() => onClose(id)} className="flex-shrink-0 text-white/50 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}

export default Toast