<!DOCTYPE html>
<html>
<head>
        <title>Surat Pengajuan</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<style type="text/css">
        .under{
                text-decoration: underline;
        }
        .font{
                font-family:sans-serif;
                font-size: 12.5px;
                color: black;
        }
        .bold{
                font-weight: bold;
        }
</style>
<body style="margin: -15px -26px 0px 0px;">
        <div class="mb-5">
                <table width="100%">
                        <tr>
                                <td align="right">
                                        <img src="storage/upload/surat/inl2.png" width="165">
                                </td>
                        </tr>
                </table>
        </div>
        <br>
        <br>
        <div class="mt-5" style="text-align: center;">
                <strong class="under font bold">SURAT PERINTAH PERJALANAN DINAS KARYAWAN</strong>
                <p class="font bold" style="margin:1.5; padding:1;">Nomor :{{$form->nomor_surat}}</p>
        </div>
        <br>
        <div class="">
                <table width="100%">
                        <tr class="font bold">
                                <td width="10%"></td>
                                <td width="5%">I.</td>
                                <td width="85%">Diberikan Kepada : </td>
                        </tr>
                </table>
        </div>
        <?php
        $bln = array(1=>'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember');
        ?>
        <div class="mb-4">
                <table width="100%">
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">1.</td>
                                <td width="20%">Nama </td>
                                <td width="60%">: {{$form->nama_pelaksana}}</td>
                        </tr>
                        @if($form->jabatan == 'Direktur Utama')
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">2.</td>
                                <td width="20%">Pangkat/Jabatan </td>
                                <td width="60%">: Direktur</td>
                        </tr>
                        @elseif($form->jabatan == 'General Manager')
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">2.</td>
                                <td width="20%">Pangkat/Jabatan </td>
                                <td width="60%">: {{$form->jabatan}} {{$form->divisi}}</td>
                        </tr>
                        @else
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">2.</td>
                                <td width="20%">Pangkat/Jabatan </td>
                                <td width="60%">: {{$form->jabatan}}</td>
                        </tr>
                        @endif
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">3.</td>
                                <td width="20%">Golongan </td>
                                <td width="60%">: - </td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">4.</td>
                                <td width="20%">Untuk bertugas ke </td>
                                <td width="60%">: {{$form->tujuan}}</td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">5.</td>
                                <td width="20%">Keperluan/Urusan </td>
                                <td width="60%">: {{$form->keperluan}}</td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">6.</td>
                                <td width="20%">Berangkat tanggal </td>
                                <td width="60%">: <?=date('j',strtotime($form->tgl_berangkat)).' '.$bln[date('n',strtotime($form->tgl_berangkat))].' '.date('Y',strtotime($form->tgl_berangkat));?></td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">7.</td>
                                <td width="20%">Kembali tanggal </td>
                                <td width="60%">: <?=date('j',strtotime($form->tgl_kembali)).' '.$bln[date('n',strtotime($form->tgl_kembali))].' '.date('Y',strtotime($form->tgl_kembali));?></td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">8.</td>
                                <td width="20%">Barang yang dibawa </td>
                                <td width="60%">: {{$form->barang}}</td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">9.</td>
                                <td width="20%">Kendaraan </td>
                                @if ($form->kendaraan == "Kendaraan Dinas")
                                <td width="60%">: Kendaraan Dinas {{$form->no_kendaraan}}</td>
                                @else
                                <td width="60%">: {{$form->kendaraan}}</td>
                                @endif
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">10.</td>
                                <td width="20%">Rombongan </td>
                                <td width="60%">: {{$form->nama_supir}}</td>
                        </tr>
                </table>
        </div>
        <br>
        <div class="">
                <table width="100%">
                        <tr class="font bold">
                                <td width="10%"></td>
                                <td width="5%">II.</td>
                                <td width="85%">Catatan : </td>
                        </tr>
                </table>
        </div>
        <div class="mb-4">
                <table width="100%">
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">-</td>
                                <td width="80%">Biaya ditanggung oleh : PT. Industri Nabati Lestari </td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">-</td>
                                <td width="80%">Tanggal kembali dari perjalanan harap dilaporan kepada PT. Industri Nabati Lestari </td>
                        </tr>
                        <tr class="font">
                                <td width="15%"></td>
                                <td width="5%">-</td>
                                <td width="80%">Mohon agar pihak berwajib memberikan bantuan seperlunya. </td>
                        </tr>
                </table>
        </div>
        <br>
        <?php

        $bulan = date('n',strtotime($form->tgl_surat));
        $tgl = date('j',strtotime($form->tgl_surat));
        $thn = date('Y',strtotime($form->tgl_surat));
        $tgl_surat = $tgl.' '.$bln[$bulan].' '.$thn;
        ?>

<div class="mt-4 mb-4">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                        <tr class="font">
                                <td width="10%"></td>
                                <td width="35%" style="border-top: 1px solid; border-right: 1px solid; border-left: 1px solid;"></td>
                                <td width="10%"></td>
                                <td width="35%">
                                        <table width="100%">
                                                <tr>
                                                        <td width="35%" style="height: 5px;">Dikeluarkan di</td>
                                                        <td width="5%" style="height: 5px;">:</td>
                                                        <td width="60%" style="height: 5px;">Sei Mangkei</td>
                                                </tr>
                                                <tr>
                                                        <td width="35%" style="height: 5px;">Pada tanggal</td>
                                                        <td width="5%" style="height: 5px;">:</td>
                                                        <td width="60%" style="height: 5px;"><?=$tgl_surat;?></td>
                                                </tr>
                                        </table>
                                </td>
                                <td width="10%"></td>
                        </tr>
                        <tr class="font">
                                <td width="10%"></td>
                                <td width="35%" style="border-right: 1px solid; border-left: 1px solid;"></td>
                                <td width="10%"></td>
                                <td width="35%" style="height: 5px;" class="bold">PT. Industri Nabati Lestari</td>
                                <td width="10%"></td>
                        </tr>
                        <tr class="font">
                                <td width="10%"></td>
                                <td width="35%" style="border-right: 1px solid; border-left: 1px solid;"></td>
                                <td width="10%"></td>
                                <td width="35%" style="height: 5px;"> </td>
                                <td width="10%"></td>
                        </tr>
                        <tr class="font" align="center">
                                <td width="10%" style="height: 120px;"></td>
                                <td width="35%" style="border-right: 1px solid !important; border-left: 1px solid !important; height: 120px; vertical-align: bottom;">
                                        <table width="100%">
                                                <tr>
                                                        <td width="10%"></td>
                                                        <td width="80%" style="font-size: 10.5px; font-style: italic; text-align: center;" class="bold under">Stempel & Tanda Tangan Instansi atau Lembaga Tujuan</td>
                                                        <td width="10%"></td>
                                                </tr>
                                        </table>
                                </td>
                                <td width="10%" style="height: 120px;"></td>
                                <td width="35%" style="height: 120px; vertical-align: bottom;">
                                        <table width="100%">
                                                @if ($form->status >= 6)
                                                <tr>
                                                        <td width="10%"></td>
                                                        <td width="60%" style="text-align:center; margin:0; padding:0;"><img src="storage/upload/ttd/{{$user->signature}}" width="100"></td>
                                                        <td width="30%"></td>
                                                </tr>
                                                @endif
                                                <tr>
                                                        <td width="10%"></td>
                                                        <td width="60%" class="under bold" style="text-align:center; margin:0; padding:0;">{{$user->name}}</td>
                                                        <td width="30%"></td>
                                                </tr>
                                        </table>
                                </td>
                                <td width="10%" style="height: 120px;"></td>
                        </tr>
                        @if($user->grade == '6')
                        <tr class="font">
                                <td width="10%"></td>
                                <td width="35%" style="border-right: 1px solid; border-left: 1px solid; border-bottom: 1px solid;"></td>
                                <td width="10%"></td>
                                <td width="35%">
                                        <table width="100%">
                                                <tr>
                                                        <td width="10%"></td>
                                                        <td width="60%" style="text-align:center;margin:0; padding:0;">Direktur</td>
                                                        <td width="30%"></td>
                                                </tr>
                                        </table>
                                </td>
                                <td width="10%"></td>
                        </tr>
                        @elseif($user->grade == '5')
                        <tr class="font">
                                <td width="10%"></td>
                                <td width="35%" style="border-right: 1px solid; border-left: 1px solid; border-bottom: 1px solid;"></td>
                                <td width="10%"></td>
                                <td width="35%">
                                <table width="100%">
                                                <tr>
                                                        <td width="10%"></td>
                                                        <td width="60%" style="text-align:center;margin:0; padding:0;">Kabag {{$user->departemen}}</td>
                                                        <td width="30%"></td>
                                                </tr>
                                        </table>
                                </td>
                                <td width="10%"></td>
                        </tr>
                        @else
                        <tr class="font">
                                <td width="10%"></td>
                                <td width="35%" style="border-right: 1px solid; border-left: 1px solid; border-bottom: 1px solid;"></td>
                                <td width="10%"></td>
                                <td width="35%">
                                <table width="100%">
                                                <tr>
                                                        <td width="10%"></td>
                                                        <td width="60%" style="text-align:center;margin:0; padding:0;">{{$user->jabatan}}</td>
                                                        <td width="30%"></td>
                                                </tr>
                                        </table>
                                </td>
                                <td width="10%"></td>
                        </tr>
                        @endif
                </table>
        </div>
        <br><br><br>
        <div class="mt-5">
                <table width="100%">
                        <tr class="font">
                                <td width="10%"></td>
                                <td width="10%">Asli</td>
                                <td width="35%">: Bagian Keuangan & Akuntansi</td>
                                <td width="35%"></td>
                                <td width="10%"></td>
                        </tr>
                </table>
        </div>

        <div style="position: fixed; bottom: 20px; left: -25px; right: 0px; height: 50px;">
                <table width="100%">
                        <tr>
                                <td>
                                        <img src="storage/upload/surat/footer.PNG" width="760">

                                </td>
                        </tr>
                </table>
        </div>
</body>
</html>
