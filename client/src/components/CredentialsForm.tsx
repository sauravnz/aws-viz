import React, { useState, useEffect } from 'react';
import { AwsCredentials } from '../../../shared/types';
import { getAvailableRegions } from '../services/api';

interface CredentialsFormProps {
  onScan: (credentials: AwsCredentials) => void;
  isLoading: boolean;
}

interface Region {
  code: string;
  name: string;
}

export const CredentialsForm: React.FC<CredentialsFormProps> = ({ onScan, isLoading }) => {
  const [credentials, setCredentials] = useState<AwsCredentials>({
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: '',
    region: 'us-east-1'
  });

  const [regions, setRegions] = useState<Region[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(false);

  useEffect(() => {
    // Load available regions on component mount
    const loadRegions = async () => {
      setLoadingRegions(true);
      try {
        const response = await getAvailableRegions();
        setRegions(response.regions);
      } catch (error) {
        console.warn('Failed to load regions, using default list:', error);
        // Fallback to default regions if API fails
        setRegions([
          { code: 'us-east-1', name: 'US East (N. Virginia)' },
          { code: 'us-east-2', name: 'US East (Ohio)' },
          { code: 'us-west-1', name: 'US West (N. California)' },
          { code: 'us-west-2', name: 'US West (Oregon)' },
          { code: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
          { code: 'eu-west-1', name: 'Europe (Ireland)' }
        ]);
      } finally {
        setLoadingRegions(false);
      }
    };

    loadRegions();
  }, []);

  const handleInputChange = (field: keyof AwsCredentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.region) {
      alert('Please fill in all required fields');
      return;
    }

    onScan(credentials);
  };

  const isFormValid = credentials.accessKeyId && credentials.secretAccessKey && credentials.region;

  return (
    <form onSubmit={handleSubmit} className="credentials-form">
      <h3 style={{ marginBottom: '20px', color: '#333', fontSize: '1.3rem' }}>
        AWS Temporary Credentials
      </h3>
      
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="accessKeyId">
            Access Key ID *
          </label>
          <input
            type="text"
            id="accessKeyId"
            value={credentials.accessKeyId}
            onChange={(e) => handleInputChange('accessKeyId', e.target.value)}
            placeholder="AKIA..."
            disabled={isLoading}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="secretAccessKey">
            Secret Access Key *
          </label>
          <input
            type="password"
            id="secretAccessKey"
            value={credentials.secretAccessKey}
            onChange={(e) => handleInputChange('secretAccessKey', e.target.value)}
            placeholder="Enter secret access key"
            disabled={isLoading}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="sessionToken">
            Session Token (Optional)
          </label>
          <input
            type="password"
            id="sessionToken"
            value={credentials.sessionToken}
            onChange={(e) => handleInputChange('sessionToken', e.target.value)}
            placeholder="Enter session token if using temporary credentials"
            disabled={isLoading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="region">
            AWS Region *
          </label>
          <select
            id="region"
            value={credentials.region}
            onChange={(e) => handleInputChange('region', e.target.value)}
            disabled={isLoading || loadingRegions}
            required
          >
            {loadingRegions ? (
              <option value="">Loading regions...</option>
            ) : (
              regions.map(region => (
                <option key={region.code} value={region.code}>
                  {region.name} ({region.code})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="scan-button"
        disabled={!isFormValid || isLoading}
      >
        {isLoading ? (
          <>
            <span className="loading-spinner"></span>
            Scanning AWS Infrastructure...
          </>
        ) : (
          '🔍 Scan AWS Infrastructure'
        )}
      </button>

      <div style={{ 
        marginTop: '15px', 
        fontSize: '0.85rem', 
        color: '#666', 
        textAlign: 'center',
        lineHeight: '1.4'
      }}>
        <p>
          🔒 <strong>Security Notice:</strong> Credentials are processed in-memory only and never stored.
          We recommend using temporary credentials or IAM roles with minimal required permissions.
        </p>
        <p>
          📋 <strong>Required Permissions:</strong> EC2:Describe*, S3:ListBuckets, RDS:Describe*, 
          Lambda:List*, IAM:List*, ELB:Describe*
        </p>
      </div>
    </form>
  );
}; 