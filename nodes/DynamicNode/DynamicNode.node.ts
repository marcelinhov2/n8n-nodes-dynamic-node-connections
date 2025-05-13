import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import { WorkflowExecute } from 'n8n-core';

export class DynamicNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Dynamic Node',
    name: 'dynamicNode',
    icon: 'file:dynamicNode.svg',
    group: ['transform'],
    version: 1,
    defaults: {
      name: 'Dynamic Node',
      color: '#00BB00',
    },
    inputs: ['main'] as NodeConnectionType[],
    outputs: ['main'] as NodeConnectionType[],
    properties: [
      {
        displayName: 'Node JSON',
        name: 'nodeJson',
        type: 'json',
        default: {},
        description: 'Full node definition (from a workflow export) to execute',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    // 1) Grab and validate the JSON the user pasted in
    const nodeJson = this.getNodeParameter('nodeJson', 0) as any;
    if (typeof nodeJson !== 'object') {
      throw new NodeOperationError(this.getNode(), 'The Node JSON must be a valid object');
    }

    // 2) Build a one-node workflow around it
    const workflowData = {
      name: 'DynamicWorkflow',
      nodes: [
        {
          ...nodeJson,
          position: [0, 0],
        },
      ],
      connections: {},
    };

    // 3) Pull in whatever “additionalData” n8n-core needs
    //    (this.getWorkflow() is your current running workflow instance)
    const additionalData = await (this.getWorkflow() as any).getActiveWorkflow();
    const workflow = new WorkflowExecute(additionalData, workflowData);

    // 4) Run it in “manual” mode
    const runResult = await workflow.run('manual', {} as any);

    // 5) Extract just the data for our node by name
    const nodeName = nodeJson.name;
    const runData = (runResult as any).runData
      ?.resultData
      ?.runData[nodeName] as INodeExecutionData[][];

    // 6) Return that so n8n pipes it downstream
    return runData || [[]];
  }
}