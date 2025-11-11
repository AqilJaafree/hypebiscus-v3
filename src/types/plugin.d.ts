// src/types/plugin.d.ts

declare global {
  interface Window {
    Jupiter: JupiterPlugin;
  }
}

export type WidgetPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
export type WidgetSize = 'sm' | 'default';
export type SwapMode = "ExactInOrOut" | "ExactIn" | "ExactOut";
export type DEFAULT_EXPLORER = 'Solana Explorer' | 'Solscan' | 'Solana Beach' | 'SolanaFM';

export interface FormProps {
  swapMode?: SwapMode;
  initialAmount?: string;
  initialInputMint?: string;
  initialOutputMint?: string;
  fixedAmount?: boolean;
  fixedMint?: string;
  referralAccount?: string;
  referralFee?: number;
}

export interface SwapResult {
  txid: string;
  inputAddress: string;
  outputAddress: string;
  inputAmount: number;
  outputAmount: number;
  otherAmountThreshold: number;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  [key: string]: unknown;
}

export interface QuoteResponse {
  quoteResponse?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TransactionError {
  error: string;
  message?: string;
  code?: string | number;
  [key: string]: unknown;
}

export interface IInit {
  localStoragePrefix?: string;
  formProps?: FormProps;
  defaultExplorer?: DEFAULT_EXPLORER;
  autoConnect?: boolean;
  displayMode?: 'modal' | 'integrated' | 'widget';
  integratedTargetId?: string;
  widgetStyle?: {
    position?: WidgetPosition;
    size?: WidgetSize;
  };
  containerStyles?: React.CSSProperties;
  containerClassName?: string;
  enableWalletPassthrough?: boolean;
  passthroughWalletContextState?: unknown;
  onRequestConnectWallet?: () => void | Promise<void>;
  onSwapError?: (params: {
    error?: TransactionError;
    quoteResponseMeta: QuoteResponse | null;
  }) => void;
  onSuccess?: (params: {
    txid: string;
    swapResult: SwapResult;
    quoteResponseMeta: QuoteResponse | null;
  }) => void;
  onFormUpdate?: (form: Record<string, unknown>) => void;
  onScreenUpdate?: (screen: Record<string, unknown>) => void;
}

export interface JupiterPlugin {
  _instance: JSX.Element | null;
  init: (props: IInit) => void;
  resume: () => void;
  close: () => void;
  root: unknown;
  enableWalletPassthrough: boolean;
  onRequestConnectWallet: IInit['onRequestConnectWallet'];
  store: unknown;
  syncProps: (props: { passthroughWalletContextState?: unknown }) => void;
  onSwapError: IInit['onSwapError'];
  onSuccess: IInit['onSuccess'];
  onFormUpdate: IInit['onFormUpdate'];
  onScreenUpdate: IInit['onScreenUpdate'];
  localStoragePrefix: string;
}

export {};