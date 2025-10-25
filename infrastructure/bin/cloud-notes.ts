#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CloudNotesStack } from '../lib/cloud-notes-stack';

const app = new cdk.App();
new CloudNotesStack(app, 'CloudNotesStack', {
  /* You can set env here for account/region */
});
