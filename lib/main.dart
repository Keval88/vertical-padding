import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

const backend =
    'https://us-central1-<project>.cloudfunctions.net/padStop'; // ← paste yours

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Vertical Padding Demo',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.teal),
      home: const HomePage(),
    );
  }
}

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});
  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  final _addr = TextEditingController();
  final _horiz = TextEditingController();
  bool _peak = false;
  Map<String, dynamic>? result;
  bool loading = false;

  Future<void> submit() async {
    setState(() => loading = true);
    final body = jsonEncode({
      'address': _addr.text,
      'horizontal_time_sec': int.tryParse(_horiz.text) ?? 0,
      'is_peak': _peak
    });
    final res =
        await http.post(Uri.parse(backend), headers: {'Content-Type': 'application/json'}, body: body);
    setState(() {
      loading = false;
      result = jsonDecode(res.body);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vertical Padding')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          TextField(controller: _addr, decoration: const InputDecoration(labelText: 'Address')),
          TextField(controller: _horiz, decoration: const InputDecoration(labelText: 'Horizontal seconds')),
          SwitchListTile(title: const Text('Peak hour?'), value: _peak, onChanged: (v) => setState(() => _peak = v)),
          const SizedBox(height: 12),
          ElevatedButton(onPressed: loading ? null : submit, child: const Text('Calculate')),
          const SizedBox(height: 20),
          if (loading) const CircularProgressIndicator(),
          if (result != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text('Vertical pad: ${result!['vertical_pad']} s\nTotal ETA: ${result!['total_sec']} s'),
              ),
            )
        ]),
      ),
    );
  }
}
