
import React from 'react';
import { useState } from 'react';
import { DatasetState } from '../types';

type Strategy = 'balance' | 'explore' | 'diverse' | 'heuristic';

interface CuratorViewProps {
  datasetState: DatasetState;
  onPostFound: (postText: string) => void;
  onError: (error: string | null) => void;
}

const CuratorView: React.FC<CuratorViewProps> = ({ datasetState, onPostFound, onError }) => {
  const [strategy, setStrategy] = useState<Strategy>('balance');
  const [isLoading, setIsLoading] = useState(false);

  const handleFindPost = async () => {
    setIsLoading(true);
    onError(null);
    try {
      const response = await fetch('/api/curator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          datasetState,
          strategy,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}. Check the server-side logs.`);
      }
      
      if (!data.postText) {
        throw new Error('API returned no post text. The model may have failed to find a suitable post.');
      }

      onPostFound(data.postText);

    } catch (err: any) {
      console.error(err);
      onError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="p-6 border border-gray-200 rounded-lg bg-gray-50">
      <h2 className="text-2xl font-semibold text-gray-800">1. Curator Agent</h2>
      <p className="mt-2 text-gray-600">Select a strategy to find a new post. The agent uses Google Search for up-to-date, relevant data.</p>
      
      <fieldset className="my-6 space-y-4">
        <legend className="text-lg font-medium text-gray-900">Strategy</legend>
        <div>
          <label className="flex items-center p-3 border rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
            <input type="radio" name="strategy" value="balance" checked={strategy === 'balance'} onChange={() => setStrategy('balance')} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"/>
            <span className="ml-3 text-sm text-gray-700"><strong className="font-semibold text-gray-900">Balance:</strong> Find posts for under-represented categories.</span>
          </label>
        </div>
        <div>
          <label className="flex items-center p-3 border rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
            <input type="radio" name="strategy" value="explore" checked={strategy === 'explore'} onChange={() => setStrategy('explore')} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"/>
            <span className="ml-3 text-sm text-gray-700"><strong className="font-semibold text-gray-900">Explore:</strong> Find complex posts with multiple categories.</span>
          </label>
        </div>
        <div>
          <label className="flex items-center p-3 border rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
            <input type="radio" name="strategy" value="diverse" checked={strategy === 'diverse'} onChange={() => setStrategy('diverse')} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"/>
            <span className="ml-3 text-sm text-gray-700"><strong className="font-semibold text-gray-900">Diverse:</strong> Find posts on a wide variety of topics.</span>
          </label>
        </div>
        <div>
          <label className="flex items-center p-3 border rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
            <input type="radio" name="strategy" value="heuristic" checked={strategy === 'heuristic'} onChange={() => setStrategy('heuristic')} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"/>
            <span className="ml-3 text-sm text-gray-700"><strong className="font-semibold text-gray-900">Heuristic:</strong> Analyze keyword triggers to find targeted posts.</span>
          </label>
        </div>
      </fieldset>

      <button onClick={handleFindPost} disabled={isLoading} className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all duration-200 ease-in-out flex items-center justify-center">
        {isLoading ? (<><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Finding Post...</>) : (`Find Post (Strategy: ${strategy})`)}
      </button>

      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-900">Current Dataset State (Counts)</h3>
        <div className="mt-2 max-h-48 overflow-y-auto bg-white p-3 border rounded-md">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(datasetState, null, 2)}</pre>
        </div>
      </div>
    </section>
  );
};

export default CuratorView;
