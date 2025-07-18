import React, { useState } from 'react';
import { CredentialsForm } from './components/CredentialsForm';
import { NetworkVisualization } from './components/NetworkVisualization';
import { AwsCredentials, GraphData } from '../../shared/types';
import { scanAwsInfrastructure } from './services/api';

interface AppState {
  isScanning: boolean;
  graphData: GraphData | null;
  error: string | null;
  success: string | null;
}

function App() {
  const [state, setState] = useState<AppState>({
    isScanning: false,
    graphData: null,
    error: null,
    success: null
  });

  const handleScan = async (credentials: AwsCredentials) => {
    setState(prev => ({
      ...prev,
      isScanning: true,
      error: null,
      success: null
    }));

    try {
      const response = await scanAwsInfrastructure(credentials);
      
      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          isScanning: false,
          graphData: response.data!,
          success: `Successfully scanned ${response.data!.metadata.totalResources} AWS resources in ${credentials.region}`
        }));
      } else {
        setState(prev => ({
          ...prev,
          isScanning: false,
          error: response.error || 'Unknown error occurred'
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isScanning: false,
        error: error instanceof Error ? error.message : 'Failed to scan AWS infrastructure'
      }));
    }
  };

  const handleRefresh = async () => {
    // To refresh, we'd need to store the last used credentials
    // For now, user needs to re-enter credentials and scan again
    setState(prev => ({
      ...prev,
      graphData: null,
      error: null,
      success: null
    }));
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>🏗️ AWS Infrastructure Visualizer</h1>
          <p>Discover and visualize your AWS resources with interactive diagrams</p>
        </header>

        <CredentialsForm 
          onScan={handleScan} 
          isLoading={state.isScanning}
        />

        {state.error && (
          <div className="error-message">
            <strong>Error:</strong> {state.error}
          </div>
        )}

        {state.success && (
          <div className="success-message">
            <strong>Success:</strong> {state.success}
          </div>
        )}

        {state.graphData && (
          <div className="visualization-container">
            <div className="viz-header">
              <h2 className="viz-title">Infrastructure Diagram</h2>
              <div className="viz-stats">
                <div className="stat-item">
                  <div className="stat-number">{state.graphData.metadata.totalResources}</div>
                  <div className="stat-label">Resources</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">{state.graphData.nodes.length}</div>
                  <div className="stat-label">Nodes</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">{state.graphData.links.length}</div>
                  <div className="stat-label">Connections</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">{state.graphData.metadata.region}</div>
                  <div className="stat-label">Region</div>
                </div>
              </div>
            </div>
            
            <div className="graph-container">
              <NetworkVisualization 
                data={state.graphData}
                onRefresh={handleRefresh}
              />
            </div>
          </div>
        )}

        {!state.graphData && !state.isScanning && (
          <div className="visualization-container">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '400px',
              color: '#666',
              fontSize: '1.2rem',
              textAlign: 'center',
              flexDirection: 'column',
              gap: '15px'
            }}>
              <div style={{ fontSize: '4rem' }}>☁️</div>
              <div>Enter your AWS credentials above to visualize your infrastructure</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                Your credentials are only used temporarily and never stored
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App; 