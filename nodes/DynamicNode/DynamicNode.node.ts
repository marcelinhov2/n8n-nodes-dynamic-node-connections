import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';
import subWorkflowTemplate from './subWorkflowTemplate.json';

export class DynamicNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Dynamic Node',
    name: 'dynamicNode',
    icon: 'file:dynamicNode.svg',
    group: ['transform'],
    version: 1,
    description: 'Dynamically execute any node JSON within your workflow',
    defaults: { name: 'Dynamic Node' },
    inputs: ['main'] as NodeConnectionType[],
    outputs: ['main'] as NodeConnectionType[],
    properties: [
      {
        displayName: 'Node JSON',
        name: 'nodeJson',
        type: 'json',
        default: {},
        description: 'Paste in your exported node JSON here',
      },
      {
        displayName: 'Execute Individually Per Item?',
        name: 'executeIndividually',
        type: 'boolean',
        default: true,
        description: 'Whether to execute the sub-workflow once per input item. If false, all items are passed in together.',
      },
      {
        displayName: 'Disable Waiting for Child Workflow(s) to Finish?',
        name: 'doNotWaitToFinish',
        type: 'boolean',
        default: false,
        description: 'Return immediately after triggering the sub-workflow. Advanced: disables result collection.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const executeIndividually = this.getNodeParameter('executeIndividually', 0) as boolean;
    const doNotWaitToFinish = this.getNodeParameter('doNotWaitToFinish', 0) as boolean;

    const rawParam = this.getNodeParameter('nodeJson', 0) as any;
    let raw: any;
    if (typeof rawParam === 'string') {
      try {
        raw = JSON.parse(rawParam);
      } catch {
        throw new NodeOperationError(this.getNode(), 'Node JSON must be valid JSON');
      }
    } else {
      raw = rawParam;
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new NodeOperationError(this.getNode(), 'Node JSON must be an object');
    }

    const baseNode = Array.isArray(raw.nodes) && raw.nodes.length > 0 ? raw.nodes[0] : raw;
    delete baseNode.connections;
    delete baseNode.pinData;
    delete baseNode.meta;

    if (!baseNode.name) {
      throw new NodeOperationError(this.getNode(), 'Your JSON must include a `name` field');
    }

    const allResults: INodeExecutionData[] = [];

    const processItem = async (item: INodeExecutionData, index: number): Promise<void> => {
      const template = JSON.parse(JSON.stringify(subWorkflowTemplate));
      const nodeClone = JSON.parse(JSON.stringify(baseNode));

      nodeClone.name = `${baseNode.name} - Dynamic Node [${index + 1}]`;
      nodeClone.id = `dynamic-${uuidv4()}`;
      nodeClone.position = Array.isArray(baseNode.position) && baseNode.position.length === 2
        ? baseNode.position
        : [240, 0];

      // Evaluate top-level parameters
      for (const key of Object.keys(nodeClone.parameters)) {
        const value = nodeClone.parameters[key];
        if (typeof value === 'string' && value.includes('{{')) {
          try {
            nodeClone.parameters[key] = await this.evaluateExpression(value, item, index);
          } catch (err) {
            this.logger.warn(`DynamicNode: Failed to evaluate parameter '${key}': ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // Evaluate nested body parameters
      const bodyParams = nodeClone.parameters?.bodyParameters?.parameters;
      if (Array.isArray(bodyParams)) {
        for (const param of bodyParams) {
          if (typeof param.value === 'string' && param.value.includes('{{')) {
            try {
              param.value = await this.evaluateExpression(param.value, item, index);
            } catch (err) {
              this.logger.warn(`DynamicNode: Failed to evaluate body param '${param.name}': ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      }

      template.nodes.push(nodeClone);
      template.connections.Start.main[0][0].node = nodeClone.name;

      const workflowProxy = this.getWorkflowDataProxy(index);

      const execResult = await this.executeWorkflow(
        { code: template },
        [item],
        {},
        {
          parentExecution: {
            executionId: workflowProxy.$execution.id,
            workflowId: workflowProxy.$workflow.id,
          },
          doNotWaitToFinish,
        },
      );

      if (!doNotWaitToFinish && execResult) {
        const resultArray = Array.isArray(execResult)
          ? execResult
          : Array.isArray((execResult as any).data)
            ? (execResult as any).data
            : [];

        allResults.push(
          ...resultArray.flat().filter((entry: unknown): entry is INodeExecutionData =>
            entry !== null && typeof entry === 'object',
          ),
        );
      }
    };

    if (executeIndividually) {
      for (let i = 0; i < inputItems.length; i++) {
        try {
          await processItem(inputItems[i], i);
        } catch (err) {
          this.logger.warn(`DynamicNode: Error processing item #${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      // One execution for all items (rare)
      const template = JSON.parse(JSON.stringify(subWorkflowTemplate));
      const nodeClone = JSON.parse(JSON.stringify(baseNode));

      nodeClone.name = `${baseNode.name} - Dynamic Node [all]`;
      nodeClone.id = `dynamic-${uuidv4()}`;
      nodeClone.position = Array.isArray(baseNode.position) && baseNode.position.length === 2
        ? baseNode.position
        : [240, 0];

      template.nodes.push(nodeClone);
      template.connections.Start.main[0][0].node = nodeClone.name;

      const workflowProxy = this.getWorkflowDataProxy(0);

      const execResult = await this.executeWorkflow(
        { code: template },
        inputItems,
        {},
        {
          parentExecution: {
            executionId: workflowProxy.$execution.id,
            workflowId: workflowProxy.$workflow.id,
          },
          doNotWaitToFinish,
        },
      );

      if (!doNotWaitToFinish && execResult) {
        const resultArray = Array.isArray(execResult)
          ? execResult
          : Array.isArray((execResult as any).data)
            ? (execResult as any).data
            : [];

        allResults.push(
          ...resultArray.flat().filter((entry: unknown): entry is INodeExecutionData =>
            entry !== null && typeof entry === 'object',
          ),
        );
      }
    }

    return [allResults];
  }
}
