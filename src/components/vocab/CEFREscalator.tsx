'use client';

import React from 'react';
import { Layers, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export const CEFREscalator: React.FC = () => {
  const clusters = useAppStore((s) => s.synonymClusters);

  return (
    <div className="w-full bg-surface border border-borderLight rounded-sm p-4 mb-4">
      <div className="flex items-center gap-2 pb-3 border-b border-borderLight mb-3">
        <Layers className="w-4 h-4 text-textPrimary" />
        <h3 className="text-sm font-bold uppercase tracking-wider">
          CEFR Escalator • Bậc Thang Nâng Cấp Từ Vựng (B1 ➔ C2)
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="p-3 bg-background border border-borderLight rounded-sm flex flex-col gap-2"
          >
            <div className="flex items-center justify-between pb-2 border-b border-borderLight">
              <span className="text-xs font-bold uppercase text-textPrimary">
                {cluster.root_concept}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-matchaLight border border-matcha rounded-sm">
                Active Cluster
              </span>
            </div>

            {/* Chuỗi bậc thang B1 -> B2 -> C1 -> C2 */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono py-1">
              <span className="px-1.5 py-0.5 bg-surface border border-borderLight rounded-sm" title="B1">
                {cluster.tier_b1}
              </span>
              <ArrowRight className="w-3 h-3 text-mutedText" />
              <span className="px-1.5 py-0.5 bg-surface border border-borderLight rounded-sm" title="B2">
                {cluster.tier_b2}
              </span>
              <ArrowRight className="w-3 h-3 text-mutedText" />
              <span className="px-1.5 py-0.5 bg-surface border border-matcha rounded-sm font-bold" title="C1">
                {cluster.tier_c1}
              </span>
              <ArrowRight className="w-3 h-3 text-mutedText" />
              <span className="px-1.5 py-0.5 bg-matcha text-textPrimary border border-borderLight rounded-sm font-bold" title="C2">
                {cluster.tier_c2}
              </span>
            </div>

            {/* Nuance Matrix */}
            <div className="text-[11px] text-mutedText leading-relaxed pt-1 border-t border-borderLight">
              <p>
                <strong>Collocation: </strong>
                {cluster.nuance_matrix.collocation}
              </p>
              <p className="mt-0.5 text-textPrimary">
                <strong>Nuance: </strong>
                {cluster.nuance_matrix.formality}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CEFREscalator;