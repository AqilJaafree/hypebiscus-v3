import { toast } from 'sonner'

const TIMING = {
  SUCCESS_DURATION: 5000,
  ERROR_DURATION: 4000
}

let lastToastId: string | number | null = null

export const showToast = {
  success: (title: string, description: string) => {
    if (lastToastId) toast.dismiss(lastToastId)
    lastToastId = toast.success(title, {
      description,
      duration: TIMING.SUCCESS_DURATION,
      style: {
        backgroundColor: '#22c55e',
        color: '#ffffff',
        border: '1px solid #16a34a',
        borderRadius: '12px'
      }
    })
  },
  error: (title: string, description: string) => {
    if (lastToastId) toast.dismiss(lastToastId)
    lastToastId = toast.error(title, {
      description,
      duration: TIMING.ERROR_DURATION,
      style: {
        backgroundColor: '#ef4444',
        color: '#ffffff',
        border: '1px solid #dc2626',
        borderRadius: '12px'
      }
    })
  },
  warning: (title: string, description: string) => {
    if (lastToastId) toast.dismiss(lastToastId)
    lastToastId = toast.warning(title, {
      description,
      duration: TIMING.ERROR_DURATION,
      style: {
        backgroundColor: '#f59e0b',
        color: '#ffffff',
        border: '1px solid #d97706',
        borderRadius: '12px'
      }
    })
  },
  info: (title: string, description: string) => {
    if (lastToastId) toast.dismiss(lastToastId)
    lastToastId = toast.info(title, {
      description,
      duration: TIMING.SUCCESS_DURATION,
      style: {
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        border: '1px solid #2563eb',
        borderRadius: '12px'
      }
    })
  }
} 