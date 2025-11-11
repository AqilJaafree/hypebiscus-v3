"use client";

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import PageTemplate from '@/components/PageTemplate';
import { SubscriptionModal } from '@/components/mcp-components/SubscriptionModal';
import { CreditsPurchaseModal } from '@/components/mcp-components/CreditsPurchaseModal';
import { Button } from '@/components/ui/button';
import {
  Lightning,
  CreditCard,
  Check,
  Sparkle,
  TrendUp,
  Bell,
  ShieldCheck,
  ChartLine
} from '@phosphor-icons/react';
import { SUBSCRIPTION_PRICE, CREDIT_PACKAGES } from '@/lib/x402Client';

export default function PricingPage() {
  const { connected } = useWallet();
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  return (
    <PageTemplate>
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-6">
            <Sparkle size={32} className="text-primary" weight="fill" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Automate your liquidity positions and maximize your returns with AI-powered management
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Subscription Plan */}
          <div className="border border-primary/30 rounded-2xl p-8 bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <div className="px-3 py-1 bg-primary rounded-full">
                <p className="text-xs font-bold text-white">RECOMMENDED</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Lightning size={28} className="text-primary" weight="fill" />
              </div>
              <h2 className="text-2xl font-bold text-white">Premium Subscription</h2>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white">${SUBSCRIPTION_PRICE}</span>
                <span className="text-xl text-gray-400">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Paid in USDC · Cancel anytime</p>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <Check size={20} className="text-primary mt-0.5 flex-shrink-0" weight="bold" />
                <div>
                  <p className="text-white font-medium">Unlimited Auto-Repositions</p>
                  <p className="text-sm text-gray-400">Never worry about position management again</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <TrendUp size={20} className="text-primary mt-0.5 flex-shrink-0" weight="bold" />
                <div>
                  <p className="text-white font-medium">AI-Powered Optimization</p>
                  <p className="text-sm text-gray-400">Smart position rebalancing for maximum returns</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Bell size={20} className="text-primary mt-0.5 flex-shrink-0" weight="bold" />
                <div>
                  <p className="text-white font-medium">Real-Time Notifications</p>
                  <p className="text-sm text-gray-400">Get alerts on Telegram & website</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ChartLine size={20} className="text-primary mt-0.5 flex-shrink-0" weight="bold" />
                <div>
                  <p className="text-white font-medium">Advanced Analytics</p>
                  <p className="text-sm text-gray-400">Deep insights into your portfolio performance</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck size={20} className="text-primary mt-0.5 flex-shrink-0" weight="bold" />
                <div>
                  <p className="text-white font-medium">Priority Support</p>
                  <p className="text-sm text-gray-400">Get help when you need it most</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowSubscriptionModal(true)}
              disabled={!connected}
              size="lg"
              className="w-full text-lg"
            >
              <Lightning size={20} className="mr-2" weight="fill" />
              {connected ? 'Get Premium' : 'Connect Wallet to Subscribe'}
            </Button>

            {!connected && (
              <p className="text-xs text-center text-gray-500 mt-3">
                Connect your wallet to purchase
              </p>
            )}
          </div>

          {/* Pay-as-you-go Credits */}
          <div className="border border-border rounded-2xl p-8 bg-gray-900/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <CreditCard size={28} className="text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Pay-As-You-Go</h2>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white">$0.01</span>
                <span className="text-xl text-gray-400">/reposition</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Buy credits that never expire</p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-3">
                <Check size={20} className="text-green-400 mt-0.5 flex-shrink-0" weight="bold" />
                <p className="text-gray-300">1 credit = 1 auto-reposition</p>
              </div>
              <div className="flex items-start gap-3">
                <Check size={20} className="text-green-400 mt-0.5 flex-shrink-0" weight="bold" />
                <p className="text-gray-300">Credits never expire</p>
              </div>
              <div className="flex items-start gap-3">
                <Check size={20} className="text-green-400 mt-0.5 flex-shrink-0" weight="bold" />
                <p className="text-gray-300">No subscription required</p>
              </div>
              <div className="flex items-start gap-3">
                <Check size={20} className="text-green-400 mt-0.5 flex-shrink-0" weight="bold" />
                <p className="text-gray-300">Flexible usage</p>
              </div>
            </div>

            {/* Credit Packages */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="border border-border rounded-lg p-4 bg-gray-800/50">
                <p className="text-xs text-gray-400 mb-1">Trial</p>
                <p className="text-2xl font-bold text-white">${CREDIT_PACKAGES.trial.price}</p>
                <p className="text-sm text-blue-400">{CREDIT_PACKAGES.trial.amount} credit</p>
              </div>
              <div className="border border-border rounded-lg p-4 bg-gray-800/50">
                <p className="text-xs text-gray-400 mb-1">Starter</p>
                <p className="text-2xl font-bold text-white">${CREDIT_PACKAGES.starter.price}</p>
                <p className="text-sm text-blue-400">{CREDIT_PACKAGES.starter.amount} credits</p>
              </div>
              <div className="border border-primary/30 rounded-lg p-4 bg-primary/5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400">Power</p>
                  <span className="text-xs bg-primary px-2 py-0.5 rounded-full text-white font-medium">Popular</span>
                </div>
                <p className="text-2xl font-bold text-white">${CREDIT_PACKAGES.power.price}</p>
                <p className="text-sm text-blue-400">{CREDIT_PACKAGES.power.amount} credits</p>
              </div>
              <div className="border border-border rounded-lg p-4 bg-gray-800/50">
                <p className="text-xs text-gray-400 mb-1">Pro</p>
                <p className="text-2xl font-bold text-white">${CREDIT_PACKAGES.pro.price}</p>
                <p className="text-sm text-blue-400">{CREDIT_PACKAGES.pro.amount} credits</p>
              </div>
            </div>

            <Button
              onClick={() => setShowCreditsModal(true)}
              disabled={!connected}
              variant="secondary"
              size="lg"
              className="w-full text-lg"
            >
              <CreditCard size={20} className="mr-2" />
              {connected ? 'Buy Credits' : 'Connect Wallet to Purchase'}
            </Button>

            {!connected && (
              <p className="text-xs text-center text-gray-500 mt-3">
                Connect your wallet to purchase
              </p>
            )}
          </div>
        </div>

        {/* Feature Comparison */}
        <div className="border border-border rounded-2xl overflow-hidden bg-gray-900/50">
          <div className="p-6 border-b border-border">
            <h3 className="text-2xl font-bold text-white">Feature Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-gray-400 font-medium">Feature</th>
                  <th className="text-center p-4 text-gray-400 font-medium">Free</th>
                  <th className="text-center p-4 text-gray-400 font-medium">Pay-As-You-Go</th>
                  <th className="text-center p-4 text-primary font-medium">Premium</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-border/50">
                  <td className="p-4 text-white">View Positions</td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4 text-white">Performance Analytics</td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4 text-white">Wallet Linking</td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4 text-white">Auto-Repositions</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  <td className="p-4 text-center text-gray-300">$0.01 per use</td>
                  <td className="p-4 text-center text-primary font-medium">Unlimited</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4 text-white">AI Chat Assistant</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  <td className="p-4 text-center text-gray-300">1 credit/query</td>
                  <td className="p-4 text-center text-primary font-medium">Unlimited</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4 text-white">Telegram Notifications</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4 text-white">Priority Support</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-white">Advanced Analytics</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  <td className="p-4 text-center text-gray-600">-</td>
                  <td className="p-4 text-center"><Check size={20} className="text-green-400 mx-auto" weight="bold" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16">
          <h3 className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-border rounded-lg p-6 bg-gray-900/50">
              <h4 className="font-semibold text-white mb-2">How do auto-repositions work?</h4>
              <p className="text-sm text-gray-400">
                Our AI monitors your liquidity positions 24/7 and automatically rebalances them when they go out of range, ensuring optimal returns without manual intervention.
              </p>
            </div>
            <div className="border border-border rounded-lg p-6 bg-gray-900/50">
              <h4 className="font-semibold text-white mb-2">Can I cancel my subscription?</h4>
              <p className="text-sm text-gray-400">
                Yes! You can cancel anytime from your settings. Your subscription will remain active until the end of the current billing period.
              </p>
            </div>
            <div className="border border-border rounded-lg p-6 bg-gray-900/50">
              <h4 className="font-semibold text-white mb-2">Do credits expire?</h4>
              <p className="text-sm text-gray-400">
                No, credits never expire. Buy once and use them whenever you need. Perfect for occasional users who don&apos;t need a subscription.
              </p>
            </div>
            <div className="border border-border rounded-lg p-6 bg-gray-900/50">
              <h4 className="font-semibold text-white mb-2">Which plan is right for me?</h4>
              <p className="text-sm text-gray-400">
                If you have multiple active positions or trade frequently, Premium is best. For occasional use, pay-as-you-go credits are more cost-effective.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSuccess={() => setShowSubscriptionModal(false)}
      />

      <CreditsPurchaseModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        onSuccess={() => setShowCreditsModal(false)}
      />
    </PageTemplate>
  );
}
