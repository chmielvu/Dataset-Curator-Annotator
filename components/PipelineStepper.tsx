import React, { FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface PipelineHeaderProps {
  curationQueueCount: number;
  verificationQueueCount: number;
}

const PipelineHeader: FC<PipelineHeaderProps> = ({ curationQueueCount, verificationQueueCount }) => {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Pipeline Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl text-rose-600 dark:text-rose-400">{curationQueueCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Ready to Annotate</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl text-rose-600 dark:text-rose-400">{verificationQueueCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Pending Verification</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
};

export default PipelineHeader;