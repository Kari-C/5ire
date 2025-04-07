# 5ire Development Setup Guide

This guide will help you set up the development environment for the 5ire project and run it locally.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20.10.0 recommended)
- [Git](https://git-scm.com/)
- [Supabase](https://supabase.com/) account (for authentication and database)
- Python & UV 

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/nanbingxyz/5ire.git
cd 5ire
```

### 2. Node.js Setup

We recommend using [asdf](https://asdf-vm.com/) for managing Node.js versions. If you have asdf installed:

```bash
# Install the required Node.js version
asdf install nodejs 20.10.0

# Set it as the local version for this project
asdf local nodejs 20.10.0
```

Alternatively, you can install Node.js v20.10.0 directly from the [official website](https://nodejs.org/).

### 3. Install Dependencies

#### ensure python venv

depend on you shell

```bash
source venv/bin/activate.fish
```

#### node.js

```bash
npm install
```

### 4. Environment Configuration

Create a `.env` file in the root directory with the following variables:

```
SUPA_PROJECT_ID=your_supabase_project_id
SUPA_KEY=your_supabase_anon_key
AXIOM_TOKEN=your_axiom_token
AXIOM_ORG_ID=your_axiom_org_id
NODE_ENV=development
```

We utilize [Axiom](https://axiom.co/) to collect anonymized minimal operational metrics and [Supabase](https://supabase.com/) for authorization and backing up settings. If these features aren't involved during development, you can just ignore them and use a dummy.env config.

To get your Axiom credentials:

1. Create an Organization on [Axiom](https://https://app.axiom.co)
2. Get Organization ID from Org Settings.
3. Create a new API Token in the organization settings.

To get your Supabase credentials:

1. Create a project on [Supabase](https://supabase.com/)
2. Go to Project Settings > API
3. Copy the Project URL - the project ID is the subdomain (e.g., for `https://xvmubowipwszxgjskdme.supabase.co`, the ID is `xvmubowipwszxgjskdme`)
4. Copy the `anon` public API key for the `SUPA_KEY` variable

### 5. Prepare Husky (Git Hooks)

```bash
npm run prepare
```

## Running the Development Environment

### Start the Development Server

```bash
npm start -- --no-sandbox --disable-gpu
```

This command will:

1. Start the Electron application in development mode
2. Enable hot reloading for changes to the codebase
3. Open the application window

## MCP Tool Servers (Optional)

The application uses Model Context Protocol (MCP) tool servers for various functionalities. These are optional for basic development but required for full functionality.

If you see errors like:

```
Error: MCP error -1: Connection closed
```

You may need to set up the relevant MCP tool servers. Check the project documentation for specific MCP tools used.

## Troubleshooting

### Supabase Connection Issues

If you see errors related to Supabase authentication:

1. Verify your `SUPA_PROJECT_ID` and `SUPA_KEY` in the `.env` file
2. Ensure your Supabase project is running and accessible
3. Check that you're using the correct API key (the `anon` public key for development)

### Node.js Version Issues

If you encounter compatibility issues:

```bash
# Check your current Node.js version
node -v

# If using asdf, ensure the correct version is active
asdf current nodejs
```

### Electron Startup Issues

If the application fails to start:

1. Try running without sandbox and GPU acceleration:

   ```bash
   npm start -- --no-sandbox --disable-gpu
   ```

2. Check the console output for specific errors

## Development Workflow

1. Make your code changes
2. The application will automatically reload with your changes
3. For changes to the main process, you may need to restart the application

## Building for Production

```bash
npm run package
```

This will create a distributable package in the `release/build` directory.

## Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Axiom Documentation](https://axiom.co/docs/reference/settings#token)
- [Model Context Protocol](https://modelcontextprotocol.io/)


## Acknowledgements

A big thanks to [@cs3b](https://github.com/cs3b) for helping with this document.
