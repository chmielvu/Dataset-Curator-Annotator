
import React from 'react';

interface PipelineHeaderProps {
  curationQueueCount: number;
  verificationQueueCount: number;
}

const PipelineHeader: React.FC<PipelineHeaderProps> = ({ curationQueueCount, verificationQueueCount }) => {
  return (
    <div className="mb-8 p-4 bg-slate-100 dark:bg-slate-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Pipeline</h3>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
        <div className="p-3 bg-white dark:bg-slate-800 rounded-md border dark:border-slate-700">
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{curationQueueCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ready to Annotate</p>
        </div>
        <div className="p-3 bg-white dark:bg-slate-800 rounded-md border dark:border-slate-700">
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{verificationQueueCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Pending Verification</p>
        </div>
      </div>
    </div>
  );
};

export default PipelineHeader;
