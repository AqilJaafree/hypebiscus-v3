import WormholeConnect, {
    WormholeConnectConfig,
    WormholeConnectTheme,
} from '@wormhole-foundation/wormhole-connect';


const Wormhole = () => {
    const config: WormholeConnectConfig = {
        network: 'Testnet',
        chains: ['Sui', 'Avalanche'],
        ui: {
            title: 'Hypebiscus',
        },
    };

    const theme: WormholeConnectTheme = {
        mode: 'dark',
        primary: '#FF4040',
    };
  
    
  return (
    <div className="w-fit h-fit  max-w-3xl mx-auto bg-[#161616] px-6 rounded-2xl border-border border">
    <WormholeConnect config={config} theme={theme} />
  </div>
  )
}

export default Wormhole