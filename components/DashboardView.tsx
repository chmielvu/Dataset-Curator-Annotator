
import React from 'react';
import { useState } from 'react';
import { DatasetState, Annotation } from '../types';
import { db } from '../lib/dexie';


const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="bg-white dark:bg-slate-800/50 p-4 rounded-lg shadow-sm border dark:border-slate-700 flex items-center space-x-4">
    <div className="flex-shrink-0 text-rose-500 dark:text-rose-400">{icon}</div>
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value.toLocaleString()}</p>
    </div>
  </div>
);


const Chart: React.FC<{ title: string; data: { [key: string]: number }; color: string }> = ({ title, data, color }) => {
  const sortedData = Object.entries(data)
    .map(([name, count]) => ({ name: name.replace(/^(cleavage|tactic|emotion)_/, '').replace(/_/g, ' '), count: count as number }))
    .filter(item => item.count > 0) 
    .sort((a, b) => b.count - a.count);

  if (sortedData.length === 0) {
    return (
      <div className="p-4 bg-white dark:bg-slate-800/50 rounded-lg shadow-sm border dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 capitalize">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">No data annotated yet for this category.</p>
      </div>
    );
  }

  const maxCount = Math.max(...sortedData.map(d => d.count), 1);

  return (
    <div className="p-4 bg-white dark:bg-slate-800/50 rounded-lg shadow-sm border dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 capitalize">{title}</h3>
      <div className="space-y-3">
        {sortedData.map(item => (
          <div key={item.name} className="grid grid-cols-3 items-center gap-4 text-sm">
            <span className="text-slate-600 dark:text-slate-400 truncate capitalize col-span-1" title={item.name}>
              {item.name}
            </span>
            <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-5 col-span-2 relative">
              <div
                className={`${color} h-5 rounded-full flex items-center justify-end text-right pr-2 transition-all duration-500 ease-out`}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              >
                <span className="text-xs font-bold text-white shadow-sm">{item.count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DatasetUploader: React.FC<{ onUpload: (annotations: Annotation[]) => void; }> = ({ onUpload }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.jsonl')) {
            setError('Invalid file type. Please select a .jsonl file.');
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim() !== '');
            const annotations: Annotation[] = [];
            const errors: string[] = [];

            lines.forEach((line, index) => {
                try {
                    // Attempt to fix common JSON errors like trailing commas
                    const cleanedLine = line.replace(/,\s*([}\]])/g, '$1');
                    annotations.push(JSON.parse(cleanedLine) as Annotation);
                } catch (e: any) {
                    errors.push(`Line ${index + 1}: ${e.message}`);
                }
            });

            if (errors.length > 0) {
                const errorMessage = `Failed to parse ${errors.length} line(s). The valid lines (if any) have been loaded. Please check the following lines in your file:\n- ${errors.slice(0, 5).join('\n- ')}`;
                setError(errorMessage + (errors.length > 5 ? `\n...and ${errors.length - 5} more.` : ''));
            }

            if (annotations.length > 0) {
                onUpload(annotations);
            } else if (errors.length === 0) {
                setError("File is empty or contains no valid annotations.");
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };


  return (
    <div className="mt-8 p-6 bg-white dark:bg-slate-800/50 rounded-lg shadow-sm border dark:border-slate-700">
        <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-slate-100">Load Existing Dataset</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Upload a JSONL file containing previous annotations. This will reset the current dashboard and state to reflect the uploaded data.</p>
        
        {error && (
            <div className="p-3 my-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500/50 text-red-800 dark:text-red-300 text-sm rounded-md whitespace-pre-wrap">
                {error}
            </div>
        )}

        <label 
          className={`inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-500 shadow-sm text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {isUploading ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ) : (
            <svg className="w-5 h-5 mr-2 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
            </svg>
          )}
          <span>{isUploading ? 'Processing...' : 'Upload .jsonl File'}</span>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} disabled={isUploading} accept=".jsonl" />
        </label>
    </div>
  );
};

const AdvancedAnalysis: React.FC = () => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisImage, setAnalysisImage] = useState<string | null>(null);

    const handleRunAnalysis = async () => {
        setIsAnalyzing(true);
        setAnalysisError(null);
        setAnalysisImage(null);

        try {
            const feedbackLog = await db.feedbackLog.toArray();
            if (feedbackLog.length === 0) {
                setAnalysisError("No feedback log data is available to analyze. Please process some items through QC first.");
                return;
            }

            const response = await fetch('/api/advanced-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedbackLog }),
            });
            
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.details || data.error || 'The analysis agent failed to generate a report.');
            }

            if (data.base64Image) {
                setAnalysisImage(`data:image/png;base64,${data.base64Image}`);
            } else {
                 throw new Error('Analysis agent did not return a valid image.');
            }

        } catch (err: any) {
            setAnalysisError(err.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="mt-8 p-6 bg-white dark:bg-slate-800/50 rounded-lg shadow-sm border dark:border-slate-700">
            <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-slate-100">Advanced Analysis (via Code Interpreter)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Generate a data-rich visualization from the QC feedback log using a Python sandbox. This provides deeper insights into annotation drift and quality.
            </p>
            <button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed"
            >
                {isAnalyzing && (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                )}
                {isAnalyzing ? 'Analyzing...' : 'Generate Tactic Agreement Report'}
            </button>

            <div className="mt-4">
                {analysisError && (
                    <div className="p-3 my-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500/50 text-red-800 dark:text-red-300 text-sm rounded-md">
                        <strong>Error:</strong> {analysisError}
                    </div>
                )}
                {isAnalyzing && !analysisImage && (
                    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800/50 animate-pulse">
                        <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    </div>
                )}
                {analysisImage && (
                    <div className="p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800/50">
                        <img src={analysisImage} alt="Advanced Analysis Report" className="w-full h-auto rounded" />
                    </div>
                )}
            </div>
        </div>
    );
};

const ExportData: React.FC = () => {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const feedbackLog = await db.feedbackLog.toArray();
            if (feedbackLog.length === 0) {
                alert("There is no annotation data to export.");
                return;
            }

            const jsonlContent = feedbackLog
                .map(entry => JSON.stringify(entry.correctedAnnotation))
                .join('\n');
            
            const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `magdalenka_annotations_${timestamp}.jsonl`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (err) {
            console.error("Failed to export data:", err);
            alert("An error occurred while exporting the data.");
        } finally {
            setIsExporting(false);
        }
    };
    
    return (
        <div className="mt-8 p-6 bg-white dark:bg-slate-800/50 rounded-lg shadow-sm border dark:border-slate-700">
            <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-slate-100">Export Annotations</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Download the entire annotated dataset as a .jsonl file. Each line corresponds to one finalized annotation.
            </p>
            <button
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-600 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:bg-slate-400 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
            >
                {isExporting && (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                )}
                {isExporting ? 'Exporting...' : 'Export to .jsonl'}
            </button>
        </div>
    );
};


interface DashboardViewProps {
  datasetState: DatasetState;
  onDatasetUpload: (annotations: Annotation[]) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ datasetState, onDatasetUpload }) => {
  const totalCleavages = Object.values(datasetState.cleavages).reduce((sum: number, count: number) => sum + count, 0);
  const totalTactics = Object.values(datasetState.tactics).reduce((sum: number, count: number) => sum + count, 0);
  const totalEmotions = Object.values(datasetState.emotions).reduce((sum: number, count: number) => sum + count, 0);

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dataset Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          A visual summary of the dataset's composition.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title="Total Annotations" 
          value={datasetState.total_annotations_processed}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
        <StatCard 
          title="Cleavage Activations" 
          value={totalCleavages}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>}
        />
        <StatCard 
          title="Tactics Identified" 
          value={totalTactics}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.286zm0 13.036h.008v.008h-.008v-.008z" />
          </svg>}
        />
        <StatCard 
          title="Emotions Fueled" 
          value={totalEmotions}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 9.75h.008v.008H9v-.008zm6 0h.008v.008H15v-.008z" />
          </svg>}
        />
      </div>
      
      <div className="space-y-8">
        <Chart title="Cleavages" data={datasetState.cleavages} color="bg-rose-500" />
        <Chart title="Tactics" data={datasetState.tactics} color="bg-blue-500" />
        <Chart title="Emotions" data={datasetState.emotions} color="bg-amber-500" />
      </div>

      <AdvancedAnalysis />

      <DatasetUploader onUpload={onDatasetUpload} />

      <ExportData />
    </section>
  );
};

export default DashboardView;